import { runAutomationCycle, setIsPartialChecking } from "./automation.js";
import { processedMessageStore } from "./messageExtractor.js";
import { deliveryAttempts } from "./state.js";

const NEXT_BUTTON_STYLES = `
  position: fixed;
  bottom: 120px;
  right: 30px;
  background-color: #25D366; /* WhatsApp green */
  color: white;
  border: none;
  border-radius: 4px;
  padding: 8px 16px;
  font-size: 14px;
  font-weight: bold;
  cursor: pointer;
  z-index: 9999;
  box-shadow: 0px 2px 5px rgba(0, 0, 0, 0.2);
`;

function clearProcessedConversationCache() {
  console.log(`Content.js: Clearing visual markers from processed conversations`);

  // Remove visual markers from conversations that might have been stuck
  const pendingElements = document.querySelectorAll(".chatgpt-pending-response");
  pendingElements.forEach((el) => {
    console.log(`Content.js: Clearing visual pending marker from element:`, el.getAttribute("data-chatgpt-conversation-id"));
    el.classList.remove("chatgpt-pending-response");
  });
}

function waitForElementOnPage(selector, timeout = 5000) {
  return new Promise((resolve) => {
    const intervalTime = 100;
    let elapsedTime = 0;
    const interval = setInterval(() => {
      const element = document.querySelector(selector);
      if (element) {
        clearInterval(interval);
        resolve(element);
      }
      elapsedTime += intervalTime;
      if (elapsedTime >= timeout) {
        clearInterval(interval);
        console.warn(`Content.js: waitForElementOnPage timed out for selector: ${selector}`);
        resolve(null);
      }
    }, intervalTime);
  });
}

// Function to remove the Next button
function removeNextButton() {
  const nextButton = document.getElementById("meta-suite-next-button");
  if (nextButton) {
    nextButton.remove();
  }
}

// Add a "Next" button to the page for partial automation mode
function addNextButton() {
  // Remove existing button if it exists
  const existingButton = document.getElementById("meta-suite-next-button");
  if (existingButton) {
    existingButton.remove();
  }

  // Create the button
  const nextButton = document.createElement("button");
  nextButton.id = "meta-suite-next-button";
  nextButton.textContent = "Next";
  nextButton.style.cssText = NEXT_BUTTON_STYLES;

  // Add click event handler
  nextButton.addEventListener("click", () => {
    setIsPartialChecking(true);
    console.log("Content.js: Next button clicked. Set isPartialChecking to true.");

    // Clear processed conversations cache to allow re-checking all conversations
    clearProcessedConversationCache();

    // Clear any pending delivery to ensure fresh scanning
    if (deliveryAttempts.currentResponseToDeliver) {
      deliveryAttempts.currentResponseToDeliver = null;
    }
    deliveryAttempts.isAttemptingDelivery = false;

    // Run automation cycle immediately to check for new messages
    setTimeout(runAutomationCycle, 500);

    // Visual feedback that the button was clicked
    nextButton.textContent = "Scanning...";
    setTimeout(() => {
      nextButton.textContent = "Next";
    }, 1500);
  });

  // Add the button to the page
  document.body.appendChild(nextButton);
  console.log("Content.js: Added 'Next' button to the page.");
}

export { waitForElementOnPage, NEXT_BUTTON_STYLES, addNextButton, removeNextButton, clearProcessedConversationCache };

export function addProcessedMessage(deliveryJob) {
  const messageKey = `${deliveryJob.conversationId}:${deliveryJob.originalQuestionText?.trim()?.slice(0, 50)}`;
  processedMessageStore.processedMessages.add(messageKey);
}

export async function attemptClick(element) {
  // Try different click methods
  try {
    // 1. Try direct click
    element.click();
    await new Promise((resolve) => setTimeout(resolve, 100));

    // 2. Try mousedown/mouseup sequence
    element.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    await new Promise((resolve) => setTimeout(resolve, 50));
    element.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
    await new Promise((resolve) => setTimeout(resolve, 50));
    element.dispatchEvent(new MouseEvent("click", { bubbles: true }));

    // 3. Try focus then click
    element.focus();
    await new Promise((resolve) => setTimeout(resolve, 50));
    element.click();
  } catch (error) {
    console.error("Click attempt failed:", error);
  }
}

export async function sendMessage(inputBox, message, isPartialAutomationEnabled, isFromCustomer, lastMessageContainer) {
  try {
    inputBox.focus();

    // Create a new keyboard event
    const event = new InputEvent("beforeinput", {
      bubbles: true,
      cancelable: true,
      inputType: "insertText",
      data: message,
    });

    // Dispatch the event
    inputBox.dispatchEvent(event);

    // Set the content
    const p = document.createElement("p");
    p.className = "selectable-text copyable-text x15bjb6t x1n2onr6";
    p.dir = "ltr";
    p.style.textIndent = "0px";
    p.style.marginTop = "0px";
    p.style.marginBottom = "0px";

    const span = document.createElement("span");
    span.className = "selectable-text copyable-text false";
    span.setAttribute("data-lexical-text", "true");
    span.textContent = message;

    // Clear and append
    p.appendChild(span);
    inputBox.textContent = "";
    inputBox.appendChild(p);

    // Trigger input event
    inputBox.dispatchEvent(
      new Event("input", {
        bubbles: true,
        cancelable: true,
      })
    );

    // Wait for draft to be set
    await new Promise((resolve) => setTimeout(resolve, 500));

    if (isPartialAutomationEnabled) {
      setIsPartialChecking(false);
      addNextButton();

      // Important: Clear delivery state to prevent looping
      deliveryAttempts.currentResponseToDeliver = null;
      deliveryAttempts.isAttemptingDelivery = false;

      addProcessedMessage(deliveryJob);
      return true;
    } else if (isFromCustomer) {
      // Find and click send button
      const sendButton = document.querySelector('button[aria-label="Send"]');
      if (sendButton) {
        console.log("Clicking send button");
        sendButton.click();
        setIsPartialChecking(true);
        lastMessageContainer.click();
      }
      return true;
    } else {
      deliveryAttempts.currentResponseToDeliver = null;
      deliveryAttempts.isAttemptingDelivery = false;
      return true;
    }
  } catch (error) {
    console.error("Error setting draft:", error);
    return false;
  }
}
