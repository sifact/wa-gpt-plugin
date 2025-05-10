// Functions for handling messages and sending them to the background script
import { processedMessageStore } from "./messageExtractor.js";
import { waitForElementOnPage, addNextButton, addProcessedMessage, attemptClick, sendMessage } from "./utils.js";
import { runAutomationCycle } from "./automation.js";
import { notFoundMessages, deliveryAttempts } from "./state.js";

// Global state for response delivery
const MAX_DELIVERY_RETRIES = 2;

// Import isPartialChecking and setIsPartialChecking from automation.js
import { setIsPartialChecking, getIsPartialChecking } from "./automation.js";

// Send questions to the background script
async function sendQuestionsToBackground(questions) {
  if (questions.length === 0) return;

  console.log(`Content.js: Processing ${questions.length} questions with delay between each`);

  // Check if we're in partial mode and already have a response being delivered
  // This is an additional safeguard to prevent multiple triggers
  if (window.isPartialAutomationEnabled && !getIsPartialChecking()) {
    console.log("Content.js: In partial mode with isPartialChecking=false. Skipping question processing to prevent multiple triggers.");
    return;
  }

  // Process only one question at a time with delay between each question
  for (let i = 0; i < questions.length; i++) {
    const q = questions[i];

    // If this isn't the first question, add a delay to prevent "Another ChatGPT request is already in progress" errors
    if (i > 0) {
      await new Promise((resolve) => setTimeout(resolve, 15000));
    }

    let stableMessageKey;
    if (q.conversationId && !q.conversationId.startsWith("new-convo-")) {
      stableMessageKey = q.conversationId + "||" + q.text;
    } else {
      stableMessageKey = q.sender + "||" + q.text;
    }

    try {
      if (notFoundMessages.has(stableMessageKey)) {
        console.log(`Skipping as it previously resulted in "NOTFOUND"`);
        if (q.previewElement && q.previewElement.classList.contains("chatgpt-pending-response")) {
          q.previewElement.classList.remove("chatgpt-pending-response");
        }

        continue;
      }

      console.log(`Content.js: Sending question to background: "${q.text}" (Sender: ${q.sender}, Conv ID: ${q.conversationId})`);

      // Mark as pending BEFORE sending
      if (q.previewElement) {
        q.previewElement.classList.add("chatgpt-pending-response");
        console.log(`Content.js: Marked conversation ${q.conversationId} as 'chatgpt-pending-response'.`);
      }

      // Check for runtime errors before proceeding
      if (chrome.runtime.lastError) {
        console.error("Content.js: Error in sendQuestionsToBackground:", chrome.runtime.lastError.message);
        if (q.previewElement) q.previewElement.classList.remove("chatgpt-pending-response"); // Unmark on error
        continue;
      }

      const uniquePrefix = `Customer-id-${q.conversationId}\nQuestion: `;

      // Add timestamp to make each request unique even for the same question
      const uniqueId = Date.now().toString().slice(-6); // Last 6 digits of timestamp

      const questionToSend = uniquePrefix + q.text;

      const response = await chrome.runtime.sendMessage({
        action: "getAnswerFromChatGPT",
        question: questionToSend,
        conversationId: q.conversationId,
        requestId: uniqueId, // Add request ID as separate parameter for tracking
      });
      // this question is exists in processedMessageStore then return

      if (chrome.runtime.lastError) {
        console.error("Content.js: Error sending message to background (getAnswerFromChatGPT):", chrome.runtime.lastError.message);
        if (q.previewElement) {
          q.previewElement.classList.remove("chatgpt-pending-response"); // Unmark
          console.log(`Content.js: Unmarked conversation ${q.conversationId} from 'chatgpt-pending-response' due to send error.`);
        }
        continue;
      }

      if (response && response.answer) {
        console.log(`Content.js: Received answer for ${q.conversationId}: "${response.answer}"`);

        if (response.answer === "NOTFOUND" || response.answer.includes("NOTFOUND")) {
          // NOTFOUND exists in the response.answer
          notFoundMessages.add(stableMessageKey);

          if (q.previewElement) {
            q.previewElement.classList.remove("chatgpt-pending-response");
            console.log(`Content.js: Unmarked ${q.conversationId} from pending due to "NOTFOUND".`);
          }
          deliveryAttempts.currentResponseToDeliver = null; // Ensure no delivery is attempted
          deliveryAttempts.isAttemptingDelivery = false; // Ensure delivery flag is reset
          continue; // Move to the next question, do not break or deliver.
        }

        // If it's a normal answer (not "NOTFOUND")
        if (q.previewElement) {
          q.previewElement.classList.remove("chatgpt-pending-response");
          console.log(`Content.js: Unmarked ${q.conversationId} from pending, preparing for delivery.`);
        }
        // Ensure the context for currentResponseToDeliver is from the correct 'q' object
        deliveryAttempts.currentResponseToDeliver = {
          conversationId: q.conversationId, // from the current question object 'q'
          sender: q.sender, // from 'q'
          originalQuestionText: q.text, // from 'q'
          answer: response.answer, // from the background script's response
          originalPreviewElement: q.previewElement, // from 'q'
          retries: 0,
        };
        // console.log(
        //   `Content.js: Staging response for delivery. Conv ID: ${currentResponseToDeliver.conversationId}, Sender: ${currentResponseToDeliver.sender}, Original Q: "${currentResponseToDeliver.originalQuestionText}", Answer: "${currentResponseToDeliver.answer}"`
        // );
        initiateResponseDeliverySequence();
        break; // IMPORTANT: Stop processing further questions, focus on delivering this one.
      } else if (response && response.error) {
        console.error(`Content.js: Error from background for question "${q.text}":`, response.error);

        // Check if this is the "Another ChatGPT request is already in progress" error
        if (response.error.includes("Another ChatGPT request is already in progress")) {
          console.log(`Content.js: Detected "Another ChatGPT request is already in progress" error for conversation ${q.conversationId}`);

          // Set a timeout to remove the pending-response class after 10 seconds
          setTimeout(() => {
            if (q.previewElement && document.body.contains(q.previewElement)) {
              q.previewElement.classList.remove("chatgpt-pending-response");
              console.log(`Content.js: Removed 'chatgpt-pending-response' class from conversation ${q.conversationId} after timeout`);
            }
          }, 10000); // 10 second delay
        } else {
          // For other errors, remove the pending-response class immediately
          if (q.previewElement) {
            q.previewElement.classList.remove("chatgpt-pending-response"); // Unmark on error from ChatGPT
            console.log(`Content.js: Unmarked conversation ${q.conversationId} from 'chatgpt-pending-response' due to ChatGPT error: ${response.error}`);
          }
        }
      } else {
        console.log(`Content.js: No valid answer or error received from background for: "${q.text}"`);
        if (q.previewElement) {
          q.previewElement.classList.remove("chatgpt-pending-response"); // Unmark if no response/error
          console.log(`Content.js: Unmarked conversation ${q.conversationId} from 'chatgpt-pending-response' due to no answer/error.`);
        }
      }
    } catch (error) {
      console.error(`Content.js: Error in sendQuestionsToBackground loop for question "${q.text}":`, error);
      if (error.message && error.message.includes("Receiving end does not exist")) {
        console.warn("Content.js: Extension context invalidated. Please reload the page.");
        break;
      }
    }
  }
}

// Function to initiate the response delivery sequence
async function initiateResponseDeliverySequence() {
  if (!deliveryAttempts.currentResponseToDeliver) {
    deliveryAttempts.isAttemptingDelivery = false; // Ensure this is reset
    return;
  }
  if (deliveryAttempts.isAttemptingDelivery) {
    return;
  }

  deliveryAttempts.isAttemptingDelivery = true;
  const deliveryJob = deliveryAttempts.currentResponseToDeliver;

  let deliverySuccessful = false;

  try {
    let clickSuccessful = false;

    // Find all WhatsApp unread chats
    const unreadChats = document.querySelectorAll('div[role="listitem"] ._ahlk');
    console.log("Found unread chats:", unreadChats.length);

    let elementToActuallyClick = null;
    let chatFound = false;
    let listItem = null;
    let chatDiv = null;
    let isFromCustomer = false;
    let lastMessageContainer = null;

    // First try - Explicitly look for the conversation by sender name
    for (const conv of unreadChats) {
      try {
        // Test different selectors to find the name element
        listItem = conv.closest('div[role="listitem"]');
        if (!listItem) continue;

        // Find all possible clickable elements
        chatDiv = listItem.querySelector("div._ak72");

        // Get chat name and preview message

        if (chatDiv) {
          const senderName = chatDiv.querySelector("div.x78zum5 span.x1iyjqo2").textContent.trim();
          console.log(`Content.js: Checking conversation: "${senderName}"`);

          if (senderName && senderName.trim() === deliveryJob.sender.trim()) {
            console.log(`Content.js: MATCH FOUND for "${deliveryJob.sender}"`);
            elementToActuallyClick = conv;
            chatFound = true;
            break;
          }
        }
      } catch (error) {
        console.error("Error checking conversation:", error);
      }
    }

    if (!chatFound) {
      console.log(`chat not found`);
      deliveryJob.retries = MAX_DELIVERY_RETRIES;
      deliveryAttempts.currentResponseToDeliver = null;
      deliveryAttempts.isAttemptingDelivery = false;
      setTimeout(runAutomationCycle, 500); // Check for other messages
      return; // Critical: exit if element is bad
    } else {
      console.log(`chat found`);

      try {
        // Try the robust click method
        const possibleClickTargets = [
          listItem.querySelector('div[role="gridcell"]'),
          listItem.querySelector('div[tabindex="-1"]'),
          listItem.querySelector("div._ak8q"),
          listItem.querySelector("div._ak8j"),
          chatDiv,
        ].filter(Boolean);

        // Try each possible target
        for (const target of possibleClickTargets) {
          await attemptClick(target);
          await new Promise((resolve) => setTimeout(resolve, 200));
        }

        clickSuccessful = true;
      } catch (clickError) {
        console.error("Content.js: Delivery - Click failed:", clickError);
      }
    }

    // check last message
    try {
      // Find all messages in the chat
      const messageContainer = document.querySelector('div[role="application"]');
      if (messageContainer) {
        const messageRows = messageContainer.querySelectorAll('div[role="row"]');
        if (messageRows && messageRows.length > 0) {
          // Get the last message container
          lastMessageContainer = messageRows[messageRows.length - 1];
          isFromCustomer = lastMessageContainer.querySelector(".message-in") !== null;

          console.log(`Content.js: Delivery - Last message appears to be from ${isFromCustomer ? "customer" : "us"}`);

          if (!isFromCustomer) {
            console.warn(`Content.js: Delivery - Aborting response as the last message is not from the customer but from us.`);
            deliveryJob.retries = MAX_DELIVERY_RETRIES; // Prevent further retries
            deliveryAttempts.currentResponseToDeliver = null;
            deliveryAttempts.isAttemptingDelivery = false;
            setTimeout(runAutomationCycle, 500);
            return; // Exit delivery attempt
          } else {
            console.log(`Content.js: Delivery - Last message is from customer, proceeding with delivery.`);
          }
        } else {
          console.warn(`Content.js: Delivery - Could not find message rows to check last message sender.`);
          // Continue anyway since we couldn't verify
        }
      } else {
        console.warn(`Content.js: Delivery - Could not find message container.`);
        // Continue anyway since we couldn't verify
      }
    } catch (lastMessageError) {
      console.error("Content.js: Delivery - Error checking last message sender:", lastMessageError);
      // Continue anyway since this is a check
    }

    if (clickSuccessful) {
      // WhatsApp Web message input selector
      const inputBox = document.querySelector('div.x1hx0egp.x6ikm8r.x1odjw0f.x1k6rcq7.x6prxxf[role="textbox"][aria-label="Type a message"]');
      const messageInputElement = inputBox;

      if (messageInputElement) {
        console.log(`input box found...`);
        const resultText = deliveryJob.answer;

        deliverySuccessful = await sendMessage(messageInputElement, resultText, window.isPartialAutomationEnabled, isFromCustomer, inputBox);
      } else {
        console.warn(`Content.js: Delivery - Message input field not found`);
      }
    } else {
      console.warn(`Content.js: Delivery - Skipping input/send because click on conversation preview failed or element not found for ${deliveryJob.conversationId}.`);
    }
  } catch (error) {
    console.error("Content.js: Delivery - Error during delivery attempt:", error);
    deliverySuccessful = false;
  }

  // Post-delivery attempt logic
  if (deliverySuccessful) {
    try {
      addProcessedMessage(deliveryJob);
    } catch (error) {
      console.log(`messageKey did not added`, error);
    }

    deliveryAttempts.currentResponseToDeliver = null;
    deliveryAttempts.isAttemptingDelivery = false;

    // Don't clear from processedConversations on successful delivery
    // This prevents re-processing the same conversation multiple times

    setTimeout(runAutomationCycle, 500); // Check for new messages fairly soon
  } else {
    console.warn(`Content.js: Delivery attempt #${deliveryJob.retries + 1} failed for ${deliveryJob.conversationId}.`);
    deliveryJob.retries++;
    if (deliveryJob.retries < MAX_DELIVERY_RETRIES) {
      console.log(`Content.js: Scheduling retry for ${deliveryJob.conversationId}.`);
      deliveryAttempts.isAttemptingDelivery = false; // Allow the next attempt by resetting the flag
      setTimeout(initiateResponseDeliverySequence, 5000); // Retry after 5 seconds
    } else {
      console.error(`Content.js: Max retries reached.`);
      deliveryAttempts.currentResponseToDeliver = null;
      deliveryAttempts.isAttemptingDelivery = false;
      setTimeout(runAutomationCycle, 500); // Check for other messages
    }
  }
}

// Function to inject a response into a conversation
async function injectResponse(conversationId, answer) {
  console.log(`Content.js: Injecting response for ${conversationId}: "${answer}"`);

  // Placeholder for actual injection logic
  // In a real implementation, this would find the conversation and input the response

  return true; // Return success status
}

export { sendQuestionsToBackground, injectResponse, initiateResponseDeliverySequence };
