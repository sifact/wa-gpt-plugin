import { fetchChatGPTAnswer } from "./chatgptService.js";
import { forwardInjectCommandToContentScript } from "./utils.js";

async function handleGetAnswerFromChatGPT(request, sendResponse) {
  try {
    // Process all questions without duplicate checking

    const answer = await fetchChatGPTAnswer(request.question);

    // Truncate long answers in logs to keep console clean
    console.log("Background: Sending answer to WhatsApp Web content script:", answer.length > 50 ? answer.substring(0, 50) + "..." : answer);

    sendResponse({ answer: answer });
  } catch (error) {
    console.error("Background: Error getting answer from ChatGPT UI:", error);
    sendResponse({ error: "Failed to get answer from ChatGPT UI: " + error });
  }
}

async function handleOpenConversationAndRespond(request, sender, sendResponse) {
  const { conversationId, answer } = request;
  console.log(`Background: Attempting to open/focus WhatsApp conversation ${conversationId} and respond.`);

  const whatsAppWebUrl = "https://web.whatsapp.com/*";

  let tabs = await chrome.tabs.query({ url: whatsAppWebUrl });
  let targetTab = null;

  if (tabs.length > 0) {
    targetTab = tabs[0];
    await chrome.tabs.update(targetTab.id, { active: true });
    await chrome.windows.update(targetTab.windowId, { focused: true });
    console.log(`Background: Found existing WhatsApp Web tab ${targetTab.id}, focusing it.`);
  } else {
    try {
      targetTab = await chrome.tabs.create({ url: "https://web.whatsapp.com/", active: true });
      console.log(`Background: No WhatsApp Web tab found. Created new tab ${targetTab.id}.`);
      await new Promise((r) => setTimeout(r, 5000)); // Wait longer for WhatsApp Web to load
    } catch (e) {
      console.error("Background: Error creating new tab:", e);
      sendResponse({ status: "Error creating tab", error: e.message });
      return;
    }
  }

  if (targetTab && targetTab.id) {
    try {
      await chrome.scripting.executeScript({
        target: { tabId: targetTab.id },
        func: forwardInjectCommandToContentScript,
        args: [request.conversationId, request.answer],
      });
      console.log(`Background: Script execution initiated in tab ${targetTab.id} for conversation ${conversationId}.`);
      sendResponse({ status: "Response injection initiated." });
    } catch (error) {
      console.error(`Background: Error executing script in tab ${targetTab.id}:`, error);
      sendResponse({ status: "Error executing script", error: error.message });
    }
  } else {
    console.error("Background: No target tab could be identified or created.");
    sendResponse({ status: "Failed to find or create WhatsApp Web tab." });
  }
}

export { handleGetAnswerFromChatGPT, handleOpenConversationAndRespond };
