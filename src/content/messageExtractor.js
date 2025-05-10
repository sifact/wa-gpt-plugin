// Functions for extracting messages and questions from WhatsApp Web

import { attemptClick } from "./utils";

// Cache for messages that were not found to be questions

// Local store for processed messages in the content script context
const processedMessages = new Set();

const processedMessageStore = {
  processedMessages,
};

// Extract phone number from contact info
function extractPhoneNumber(contactHeader) {
  // Try to find contact info with phone number
  if (!contactHeader) return null;

  // WhatsApp Web shows phone numbers in various formats depending on contact
  // Try to get it from the header text content
  const headerText = contactHeader.textContent || "";

  // Look for patterns like +1 234 567 8901 or just numbers
  const phoneMatch = headerText.match(/(?:\+\d{1,3})?\s?(?:\d{1,4}[\s-]?){2,3}\d{2,4}/);
  if (phoneMatch) {
    // Clean up the phone number - remove spaces, dashes, etc
    return phoneMatch[0].replace(/\s+|-|\(|\)/g, "");
  }

  return null;
}

// Extract questions from WhatsApp Web - unread messages
async function extractQuestions() {
  const questions = [];

  // Find all chat list items with unread messages
  const unreadChats = document.querySelectorAll('div[role="listitem"] ._ahlk');
  console.log(`Content.js: Found ${unreadChats.length} unread chats.`);

  if (unreadChats.length === 0) {
    return questions;
  }

  for (const unreadBadge of unreadChats) {
    let senderName = "Unknown Sender";
    let messageText = "";
    let phoneNumber = null;
    let conversationId = null;

    try {
      // Get the parent list item
      const listItem = unreadBadge.closest('div[role="listitem"]');
      if (!listItem) continue;

      // Find the chat container
      const chatDiv = listItem.querySelector("div._ak72");
      if (!chatDiv) continue;

      const svg = chatDiv.querySelector('span[data-icon="status-dblcheck"] svg') || chatDiv.querySelector("div.x78zum5.x1okw0bk.x1ozewix.x16dsc37.x1xp8n7a.xl56j7k.xfs2ol5");
      if (svg) {
        console.log("Content.js: Message already read, skipping");
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
        }

        continue;
      } else {
        console.log("No SVG found, message is unread");
      }

      // Get chat name and preview message
      const nameElement = chatDiv.querySelector("div.x78zum5 span.x1iyjqo2");
      if (nameElement) {
        senderName = nameElement.textContent.trim();
      }

      // Get preview message
      const messageElement = chatDiv.querySelector("div._ak8k span.x1iyjqo2");
      if (!messageElement) continue;

      messageText = messageElement.textContent.trim();
      if (messageText === "typing…") continue;

      // Skip own messages that start with "You:"
      if (messageText.toLowerCase().startsWith("you:") || messageText.toLowerCase().startsWith("you: ")) {
        console.log("Content.js: Message starts with 'You:', skipping");
        continue;
      }

      // Generate a phone number-based ID
      // Since we're not opening the chat, we'll extract phone number from DOM elements or use a hash of the name
      function simpleHash(str) {
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
          hash = (hash << 5) - hash + str.charCodeAt(i);
          hash |= 0;
        }
        return Math.abs(hash).toString().substring(0, 10); // Use 10 digits to simulate a phone number
      }

      // Try to extract phone from list item or use hash of name as fallback
      phoneNumber = simpleHash(senderName);
      conversationId = phoneNumber;

      // Generate a unique key for this conversation + message
      const messageKey = `${conversationId}:${messageText?.trim()?.slice(0, 50)}`;
      if (processedMessageStore.processedMessages.has(messageKey)) {
        console.log(`Content.js: Message already processed, skipping: ${messageKey}`);
        continue;
      }

      // Add an attribute to help identify the conversation
      listItem.setAttribute("data-chatgpt-conversation-id", conversationId);

      // Add the message to our questions array
      questions.push({
        id: `q-${conversationId}`,
        text: messageText,
        sender: senderName,
        conversationId: conversationId,
        phoneNumber: phoneNumber, // Store phone number for later use
        previewElement: listItem,
      });

      console.log(`Content.js: Sender "${senderName}": Successfully extracted UNREAD question: "${messageText}" (Conv ID: ${conversationId}). Added to processing queue.`);

      // Add visual marker class and data attribute
      listItem.classList.add("chatgpt-pending-response");
      listItem.setAttribute("data-chatgpt-processing-time", Date.now().toString());
    } catch (error) {
      console.error("Content.js: Error processing a conversation:", error);
    }
  }

  if (questions.length === 0) {
    console.log("Content.js: No new, unread messages.");
  }
  return questions;
}

// Process a conversation to extract details
function processConversation(conversationId) {
  // Find the conversation container by the data attribute we set
  const container = document.querySelector(`[data-chatgpt-conversation-id="${conversationId}"]`);
  if (!container) {
    console.log(`Processing conversation: ${conversationId} - Container not found`);
    return null;
  }

  // Extract details using the WhatsApp Web selectors
  const chatDiv = container.querySelector("div._ak72");
  const nameElement = chatDiv?.querySelector("div.x78zum5 span.x1iyjqo2");
  const messageElement = chatDiv?.querySelector("div._ak8k span.x1iyjqo2");

  return {
    id: conversationId,
    phoneNumber: conversationId, // We're using the conversation ID as the phone number
    customerName: nameElement ? nameElement.textContent.trim() : "Unknown Customer",
    lastMessage: messageElement ? messageElement.textContent.trim() : "No message found",
  };
}

export { extractQuestions, processConversation, processedMessageStore };
