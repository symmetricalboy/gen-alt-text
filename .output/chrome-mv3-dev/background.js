var background = function() {
  "use strict";
  var _a, _b;
  function defineBackground(arg) {
    if (arg == null || typeof arg === "function") return { main: arg };
    return arg;
  }
  const browser$1 = ((_b = (_a = globalThis.browser) == null ? void 0 : _a.runtime) == null ? void 0 : _b.id) ? globalThis.browser : globalThis.chrome;
  const browser = browser$1;
  const definition = defineBackground(() => {
    console.log("Bluesky Alt Text Generator background script loaded");
    const GEMINI_API_KEY = "AIzaSyAx4lu3oWb8dxjNTpwzlg-asd9M44vYtN0";
    const customInstructions = `You will be provided with images. For each image, your task is to generate alternative text (alt-text) that describes the image's content and context. This alt-text is intended for use with screen reader technology, assisting individuals who are blind or visually impaired to understand the image. Adhere to the following guidelines strictly:

1.  **Content and Purpose:**
    *   Describe the image's content accurately and thoroughly. Explain the image in the context that it is presented.
    *   Convey the image's purpose. Why is this image included? What information is it trying to present? What is the core message?
    *   Prioritize the most important information, placing it at the beginning of the alt-text.
    *   If the image serves a specific function (e.g., a button or a link), describe the function. Example: "Search button" or "Link to the homepage".
    * Note if this image is a, "photograph", "painting", "illustration", "diagram", or otherwise.

2.  **Text within the Image:**
    *   If the image contains text, transcribe the text *verbatim* within the alt-text. Indicate that this is a direct quote from the image by using quotation marks. Example: 'A sign that reads, "Welcome to Our Store. Open 24/7".'
    *    If the image contain a large block of text, such as a screenshot of an article, again, we must ALWAY, *verbatim*, quote the image, up to 2000 characters.
    *    For screenshots with UI elements, exercise careful judgment. Omit minor UI text (e.g., menu item hover text, tooltips) that doesn't contribute significantly to understanding the core content of the screenshot. Focus on describing the main UI elements and their states (e.g., "A webpage with a navigation menu expanded, showing options for 'Home', 'About', and 'Contact'.").

3.  **Brevity and Clarity:**
    *   Keep descriptions concise, ideally under 100-125 characters where possible, *except* when transcribing text within the image. Longer text transcriptions take precedence over brevity.
    *   Use clear, simple language. Avoid jargon or overly technical terms unless they are essential to the image's meaning and present within the image itself.
    *   Use proper grammar, punctuation, and capitalization. End sentences with a period.

4.  **Notable Individuals:**
    *   If the image contains recognizable people, identify them by name. If their role or title is relevant to the image's context, include that as well. Example: "Photo of Barack Obama, former President of the United States, giving a speech."

5.  **Inappropriate or Sensitive Content:**
    *   If an image depicts content that is potentially inappropriate, offensive, or harmful, maintain a professional and objective tone.
    *   Use clinical and descriptive language, avoiding overly graphic or sensationalized phrasing. Focus on conveying the factual content of the image without unnecessary embellishment. Strive for a PG-13 level of description.

6.  **Output Format:**
    *   Provide *only* the image description. Do *not* include any introductory phrases (e.g., "The image shows...", "Alt-text:"), conversational elements ("Here's the description"), or follow-up statements ("Let me know if you need..."). Output *just* the descriptive text.

7.  **Decorative Images:**
    *   If the image is purely decorative and provides no information, do not supply alt-text. Leave it empty. But make certain that the image is, for a fact, not providing any value before doing so.

8. **Do Not's:**
    * Do not begin alt text with, "Image of..", or similar phrasing, it is already implied.
    * Do not add additional information that is not directly shown within the image.
    * Do not repeat information that already exists in adjacent text.

By consistently applying these guidelines, you will create alt-text that is informative, concise, and helpful for users of assistive technology.`;
    browser.runtime.onMessage.addListener(async (message, sender, sendResponse) => {
      var _a2, _b2, _c, _d, _e;
      if (message.type === "GENERATE_ALT_TEXT") {
        try {
          console.log("Received alt text generation request for image:", message.imageUrl);
          const response = await fetch(message.imageUrl);
          if (!response.ok) {
            throw new Error(`Failed to fetch image: ${response.statusText}`);
          }
          const blob = await response.blob();
          const base64Image = await blobToBase64(blob);
          const mimeType = blob.type;
          console.log("Image fetched and converted to base64");
          const GEMINI_API_URL = "https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent";
          const geminiRequestBody = {
            contents: [{
              parts: [
                // Use the custom instructions here
                { text: customInstructions },
                {
                  inline_data: {
                    mime_type: mimeType,
                    data: base64Image
                  }
                }
              ]
            }]
          };
          const geminiResponse = await fetch(`${GEMINI_API_URL}?key=${GEMINI_API_KEY}`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json"
            },
            body: JSON.stringify(geminiRequestBody)
          });
          if (!geminiResponse.ok) {
            const errorText = await geminiResponse.text();
            throw new Error(`Gemini API error: ${geminiResponse.status} - ${errorText}`);
          }
          const geminiData = await geminiResponse.json();
          console.log("Gemini API response received");
          const generatedText = (_e = (_d = (_c = (_b2 = (_a2 = geminiData.candidates) == null ? void 0 : _a2[0]) == null ? void 0 : _b2.content) == null ? void 0 : _c.parts) == null ? void 0 : _d[0]) == null ? void 0 : _e.text;
          if (!generatedText) {
            throw new Error("Could not extract text from Gemini response");
          }
          sendResponse({
            success: true,
            altText: generatedText.trim()
          });
        } catch (error) {
          console.error("Error generating alt text:", error);
          sendResponse({
            success: false,
            error: error.message || "Unknown error occurred"
          });
        }
        return true;
      }
    });
    function blobToBase64(blob) {
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => {
          const base64 = reader.result.split(",")[1];
          resolve(base64);
        };
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });
    }
  });
  background;
  function initPlugins() {
  }
  var _MatchPattern = class {
    constructor(matchPattern) {
      if (matchPattern === "<all_urls>") {
        this.isAllUrls = true;
        this.protocolMatches = [..._MatchPattern.PROTOCOLS];
        this.hostnameMatch = "*";
        this.pathnameMatch = "*";
      } else {
        const groups = /(.*):\/\/(.*?)(\/.*)/.exec(matchPattern);
        if (groups == null)
          throw new InvalidMatchPattern(matchPattern, "Incorrect format");
        const [_, protocol, hostname, pathname] = groups;
        validateProtocol(matchPattern, protocol);
        validateHostname(matchPattern, hostname);
        this.protocolMatches = protocol === "*" ? ["http", "https"] : [protocol];
        this.hostnameMatch = hostname;
        this.pathnameMatch = pathname;
      }
    }
    includes(url) {
      if (this.isAllUrls)
        return true;
      const u = typeof url === "string" ? new URL(url) : url instanceof Location ? new URL(url.href) : url;
      return !!this.protocolMatches.find((protocol) => {
        if (protocol === "http")
          return this.isHttpMatch(u);
        if (protocol === "https")
          return this.isHttpsMatch(u);
        if (protocol === "file")
          return this.isFileMatch(u);
        if (protocol === "ftp")
          return this.isFtpMatch(u);
        if (protocol === "urn")
          return this.isUrnMatch(u);
      });
    }
    isHttpMatch(url) {
      return url.protocol === "http:" && this.isHostPathMatch(url);
    }
    isHttpsMatch(url) {
      return url.protocol === "https:" && this.isHostPathMatch(url);
    }
    isHostPathMatch(url) {
      if (!this.hostnameMatch || !this.pathnameMatch)
        return false;
      const hostnameMatchRegexs = [
        this.convertPatternToRegex(this.hostnameMatch),
        this.convertPatternToRegex(this.hostnameMatch.replace(/^\*\./, ""))
      ];
      const pathnameMatchRegex = this.convertPatternToRegex(this.pathnameMatch);
      return !!hostnameMatchRegexs.find((regex) => regex.test(url.hostname)) && pathnameMatchRegex.test(url.pathname);
    }
    isFileMatch(url) {
      throw Error("Not implemented: file:// pattern matching. Open a PR to add support");
    }
    isFtpMatch(url) {
      throw Error("Not implemented: ftp:// pattern matching. Open a PR to add support");
    }
    isUrnMatch(url) {
      throw Error("Not implemented: urn:// pattern matching. Open a PR to add support");
    }
    convertPatternToRegex(pattern) {
      const escaped = this.escapeForRegex(pattern);
      const starsReplaced = escaped.replace(/\\\*/g, ".*");
      return RegExp(`^${starsReplaced}$`);
    }
    escapeForRegex(string) {
      return string.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    }
  };
  var MatchPattern = _MatchPattern;
  MatchPattern.PROTOCOLS = ["http", "https", "file", "ftp", "urn"];
  var InvalidMatchPattern = class extends Error {
    constructor(matchPattern, reason) {
      super(`Invalid match pattern "${matchPattern}": ${reason}`);
    }
  };
  function validateProtocol(matchPattern, protocol) {
    if (!MatchPattern.PROTOCOLS.includes(protocol) && protocol !== "*")
      throw new InvalidMatchPattern(
        matchPattern,
        `${protocol} not a valid protocol (${MatchPattern.PROTOCOLS.join(", ")})`
      );
  }
  function validateHostname(matchPattern, hostname) {
    if (hostname.includes(":"))
      throw new InvalidMatchPattern(matchPattern, `Hostname cannot include a port`);
    if (hostname.includes("*") && hostname.length > 1 && !hostname.startsWith("*."))
      throw new InvalidMatchPattern(
        matchPattern,
        `If using a wildcard (*), it must go at the start of the hostname`
      );
  }
  function print(method, ...args) {
    if (typeof args[0] === "string") {
      const message = args.shift();
      method(`[wxt] ${message}`, ...args);
    } else {
      method("[wxt]", ...args);
    }
  }
  const logger = {
    debug: (...args) => print(console.debug, ...args),
    log: (...args) => print(console.log, ...args),
    warn: (...args) => print(console.warn, ...args),
    error: (...args) => print(console.error, ...args)
  };
  let ws;
  function getDevServerWebSocket() {
    if (ws == null) {
      const serverUrl = `${"ws:"}//${"localhost"}:${3e3}`;
      logger.debug("Connecting to dev server @", serverUrl);
      ws = new WebSocket(serverUrl, "vite-hmr");
      ws.addWxtEventListener = ws.addEventListener.bind(ws);
      ws.sendCustom = (event, payload) => ws == null ? void 0 : ws.send(JSON.stringify({ type: "custom", event, payload }));
      ws.addEventListener("open", () => {
        logger.debug("Connected to dev server");
      });
      ws.addEventListener("close", () => {
        logger.debug("Disconnected from dev server");
      });
      ws.addEventListener("error", (event) => {
        logger.error("Failed to connect to dev server", event);
      });
      ws.addEventListener("message", (e) => {
        try {
          const message = JSON.parse(e.data);
          if (message.type === "custom") {
            ws == null ? void 0 : ws.dispatchEvent(
              new CustomEvent(message.event, { detail: message.data })
            );
          }
        } catch (err) {
          logger.error("Failed to handle message", err);
        }
      });
    }
    return ws;
  }
  function keepServiceWorkerAlive() {
    setInterval(async () => {
      await browser.runtime.getPlatformInfo();
    }, 5e3);
  }
  function reloadContentScript(payload) {
    const manifest = browser.runtime.getManifest();
    if (manifest.manifest_version == 2) {
      void reloadContentScriptMv2();
    } else {
      void reloadContentScriptMv3(payload);
    }
  }
  async function reloadContentScriptMv3({
    registration,
    contentScript
  }) {
    if (registration === "runtime") {
      await reloadRuntimeContentScriptMv3(contentScript);
    } else {
      await reloadManifestContentScriptMv3(contentScript);
    }
  }
  async function reloadManifestContentScriptMv3(contentScript) {
    const id = `wxt:${contentScript.js[0]}`;
    logger.log("Reloading content script:", contentScript);
    const registered = await browser.scripting.getRegisteredContentScripts();
    logger.debug("Existing scripts:", registered);
    const existing = registered.find((cs) => cs.id === id);
    if (existing) {
      logger.debug("Updating content script", existing);
      await browser.scripting.updateContentScripts([{ ...contentScript, id }]);
    } else {
      logger.debug("Registering new content script...");
      await browser.scripting.registerContentScripts([{ ...contentScript, id }]);
    }
    await reloadTabsForContentScript(contentScript);
  }
  async function reloadRuntimeContentScriptMv3(contentScript) {
    logger.log("Reloading content script:", contentScript);
    const registered = await browser.scripting.getRegisteredContentScripts();
    logger.debug("Existing scripts:", registered);
    const matches = registered.filter((cs) => {
      var _a2, _b2;
      const hasJs = (_a2 = contentScript.js) == null ? void 0 : _a2.find((js) => {
        var _a3;
        return (_a3 = cs.js) == null ? void 0 : _a3.includes(js);
      });
      const hasCss = (_b2 = contentScript.css) == null ? void 0 : _b2.find((css) => {
        var _a3;
        return (_a3 = cs.css) == null ? void 0 : _a3.includes(css);
      });
      return hasJs || hasCss;
    });
    if (matches.length === 0) {
      logger.log(
        "Content script is not registered yet, nothing to reload",
        contentScript
      );
      return;
    }
    await browser.scripting.updateContentScripts(matches);
    await reloadTabsForContentScript(contentScript);
  }
  async function reloadTabsForContentScript(contentScript) {
    const allTabs = await browser.tabs.query({});
    const matchPatterns = contentScript.matches.map(
      (match) => new MatchPattern(match)
    );
    const matchingTabs = allTabs.filter((tab) => {
      const url = tab.url;
      if (!url) return false;
      return !!matchPatterns.find((pattern) => pattern.includes(url));
    });
    await Promise.all(
      matchingTabs.map(async (tab) => {
        try {
          await browser.tabs.reload(tab.id);
        } catch (err) {
          logger.warn("Failed to reload tab:", err);
        }
      })
    );
  }
  async function reloadContentScriptMv2(_payload) {
    throw Error("TODO: reloadContentScriptMv2");
  }
  {
    try {
      const ws2 = getDevServerWebSocket();
      ws2.addWxtEventListener("wxt:reload-extension", () => {
        browser.runtime.reload();
      });
      ws2.addWxtEventListener("wxt:reload-content-script", (event) => {
        reloadContentScript(event.detail);
      });
      if (true) {
        ws2.addEventListener(
          "open",
          () => ws2.sendCustom("wxt:background-initialized")
        );
        keepServiceWorkerAlive();
      }
    } catch (err) {
      logger.error("Failed to setup web socket connection with dev server", err);
    }
    browser.commands.onCommand.addListener((command) => {
      if (command === "wxt:reload-extension") {
        browser.runtime.reload();
      }
    });
  }
  let result;
  try {
    initPlugins();
    result = definition.main();
    if (result instanceof Promise) {
      console.warn(
        "The background's main() function return a promise, but it must be synchronous"
      );
    }
  } catch (err) {
    logger.error("The background crashed on startup!");
    throw err;
  }
  const result$1 = result;
  return result$1;
}();
background;
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYmFja2dyb3VuZC5qcyIsInNvdXJjZXMiOlsiLi4vLi4vbm9kZV9tb2R1bGVzL3d4dC9kaXN0L3V0aWxzL2RlZmluZS1iYWNrZ3JvdW5kLm1qcyIsIi4uLy4uL25vZGVfbW9kdWxlcy9Ad3h0LWRldi9icm93c2VyL3NyYy9pbmRleC5tanMiLCIuLi8uLi9ub2RlX21vZHVsZXMvd3h0L2Rpc3QvYnJvd3Nlci5tanMiLCIuLi8uLi9lbnRyeXBvaW50cy9iYWNrZ3JvdW5kLnRzIiwiLi4vLi4vbm9kZV9tb2R1bGVzL0B3ZWJleHQtY29yZS9tYXRjaC1wYXR0ZXJucy9saWIvaW5kZXguanMiXSwic291cmNlc0NvbnRlbnQiOlsiZXhwb3J0IGZ1bmN0aW9uIGRlZmluZUJhY2tncm91bmQoYXJnKSB7XG4gIGlmIChhcmcgPT0gbnVsbCB8fCB0eXBlb2YgYXJnID09PSBcImZ1bmN0aW9uXCIpIHJldHVybiB7IG1haW46IGFyZyB9O1xuICByZXR1cm4gYXJnO1xufVxuIiwiLy8gI3JlZ2lvbiBzbmlwcGV0XG5leHBvcnQgY29uc3QgYnJvd3NlciA9IGdsb2JhbFRoaXMuYnJvd3Nlcj8ucnVudGltZT8uaWRcbiAgPyBnbG9iYWxUaGlzLmJyb3dzZXJcbiAgOiBnbG9iYWxUaGlzLmNocm9tZTtcbi8vICNlbmRyZWdpb24gc25pcHBldFxuIiwiaW1wb3J0IHsgYnJvd3NlciBhcyBfYnJvd3NlciB9IGZyb20gXCJAd3h0LWRldi9icm93c2VyXCI7XG5leHBvcnQgY29uc3QgYnJvd3NlciA9IF9icm93c2VyO1xuZXhwb3J0IHt9O1xuIiwiZXhwb3J0IGRlZmF1bHQgZGVmaW5lQmFja2dyb3VuZCgoKSA9PiB7XHJcbiAgY29uc29sZS5sb2coJ0JsdWVza3kgQWx0IFRleHQgR2VuZXJhdG9yIGJhY2tncm91bmQgc2NyaXB0IGxvYWRlZCcpO1xyXG4gIFxyXG4gIC8vIENoZWNrIEFQSSBrZXkgZWFybHlcclxuICBjb25zdCBHRU1JTklfQVBJX0tFWSA9IGltcG9ydC5tZXRhLmVudi5WSVRFX0dFTUlOSV9BUElfS0VZO1xyXG4gIGlmICghR0VNSU5JX0FQSV9LRVkpIHtcclxuICAgIGNvbnNvbGUuZXJyb3IoJ1ZJVEVfR0VNSU5JX0FQSV9LRVkgbm90IGZvdW5kIC0gcGxlYXNlIGFkZCBpdCB0byAuZW52IGZpbGUnKTtcclxuICB9XHJcbiAgXHJcbiAgLy8gU3RvcmUgdGhlIGN1c3RvbSBpbnN0cnVjdGlvbnNcclxuICBjb25zdCBjdXN0b21JbnN0cnVjdGlvbnMgPSBgWW91IHdpbGwgYmUgcHJvdmlkZWQgd2l0aCBpbWFnZXMuIEZvciBlYWNoIGltYWdlLCB5b3VyIHRhc2sgaXMgdG8gZ2VuZXJhdGUgYWx0ZXJuYXRpdmUgdGV4dCAoYWx0LXRleHQpIHRoYXQgZGVzY3JpYmVzIHRoZSBpbWFnZSdzIGNvbnRlbnQgYW5kIGNvbnRleHQuIFRoaXMgYWx0LXRleHQgaXMgaW50ZW5kZWQgZm9yIHVzZSB3aXRoIHNjcmVlbiByZWFkZXIgdGVjaG5vbG9neSwgYXNzaXN0aW5nIGluZGl2aWR1YWxzIHdobyBhcmUgYmxpbmQgb3IgdmlzdWFsbHkgaW1wYWlyZWQgdG8gdW5kZXJzdGFuZCB0aGUgaW1hZ2UuIEFkaGVyZSB0byB0aGUgZm9sbG93aW5nIGd1aWRlbGluZXMgc3RyaWN0bHk6XHJcblxyXG4xLiAgKipDb250ZW50IGFuZCBQdXJwb3NlOioqXHJcbiAgICAqICAgRGVzY3JpYmUgdGhlIGltYWdlJ3MgY29udGVudCBhY2N1cmF0ZWx5IGFuZCB0aG9yb3VnaGx5LiBFeHBsYWluIHRoZSBpbWFnZSBpbiB0aGUgY29udGV4dCB0aGF0IGl0IGlzIHByZXNlbnRlZC5cclxuICAgICogICBDb252ZXkgdGhlIGltYWdlJ3MgcHVycG9zZS4gV2h5IGlzIHRoaXMgaW1hZ2UgaW5jbHVkZWQ/IFdoYXQgaW5mb3JtYXRpb24gaXMgaXQgdHJ5aW5nIHRvIHByZXNlbnQ/IFdoYXQgaXMgdGhlIGNvcmUgbWVzc2FnZT9cclxuICAgICogICBQcmlvcml0aXplIHRoZSBtb3N0IGltcG9ydGFudCBpbmZvcm1hdGlvbiwgcGxhY2luZyBpdCBhdCB0aGUgYmVnaW5uaW5nIG9mIHRoZSBhbHQtdGV4dC5cclxuICAgICogICBJZiB0aGUgaW1hZ2Ugc2VydmVzIGEgc3BlY2lmaWMgZnVuY3Rpb24gKGUuZy4sIGEgYnV0dG9uIG9yIGEgbGluayksIGRlc2NyaWJlIHRoZSBmdW5jdGlvbi4gRXhhbXBsZTogXCJTZWFyY2ggYnV0dG9uXCIgb3IgXCJMaW5rIHRvIHRoZSBob21lcGFnZVwiLlxyXG4gICAgKiBOb3RlIGlmIHRoaXMgaW1hZ2UgaXMgYSwgXCJwaG90b2dyYXBoXCIsIFwicGFpbnRpbmdcIiwgXCJpbGx1c3RyYXRpb25cIiwgXCJkaWFncmFtXCIsIG9yIG90aGVyd2lzZS5cclxuXHJcbjIuICAqKlRleHQgd2l0aGluIHRoZSBJbWFnZToqKlxyXG4gICAgKiAgIElmIHRoZSBpbWFnZSBjb250YWlucyB0ZXh0LCB0cmFuc2NyaWJlIHRoZSB0ZXh0ICp2ZXJiYXRpbSogd2l0aGluIHRoZSBhbHQtdGV4dC4gSW5kaWNhdGUgdGhhdCB0aGlzIGlzIGEgZGlyZWN0IHF1b3RlIGZyb20gdGhlIGltYWdlIGJ5IHVzaW5nIHF1b3RhdGlvbiBtYXJrcy4gRXhhbXBsZTogJ0Egc2lnbiB0aGF0IHJlYWRzLCBcIldlbGNvbWUgdG8gT3VyIFN0b3JlLiBPcGVuIDI0LzdcIi4nXHJcbiAgICAqICAgIElmIHRoZSBpbWFnZSBjb250YWluIGEgbGFyZ2UgYmxvY2sgb2YgdGV4dCwgc3VjaCBhcyBhIHNjcmVlbnNob3Qgb2YgYW4gYXJ0aWNsZSwgYWdhaW4sIHdlIG11c3QgQUxXQVksICp2ZXJiYXRpbSosIHF1b3RlIHRoZSBpbWFnZSwgdXAgdG8gMjAwMCBjaGFyYWN0ZXJzLlxyXG4gICAgKiAgICBGb3Igc2NyZWVuc2hvdHMgd2l0aCBVSSBlbGVtZW50cywgZXhlcmNpc2UgY2FyZWZ1bCBqdWRnbWVudC4gT21pdCBtaW5vciBVSSB0ZXh0IChlLmcuLCBtZW51IGl0ZW0gaG92ZXIgdGV4dCwgdG9vbHRpcHMpIHRoYXQgZG9lc24ndCBjb250cmlidXRlIHNpZ25pZmljYW50bHkgdG8gdW5kZXJzdGFuZGluZyB0aGUgY29yZSBjb250ZW50IG9mIHRoZSBzY3JlZW5zaG90LiBGb2N1cyBvbiBkZXNjcmliaW5nIHRoZSBtYWluIFVJIGVsZW1lbnRzIGFuZCB0aGVpciBzdGF0ZXMgKGUuZy4sIFwiQSB3ZWJwYWdlIHdpdGggYSBuYXZpZ2F0aW9uIG1lbnUgZXhwYW5kZWQsIHNob3dpbmcgb3B0aW9ucyBmb3IgJ0hvbWUnLCAnQWJvdXQnLCBhbmQgJ0NvbnRhY3QnLlwiKS5cclxuXHJcbjMuICAqKkJyZXZpdHkgYW5kIENsYXJpdHk6KipcclxuICAgICogICBLZWVwIGRlc2NyaXB0aW9ucyBjb25jaXNlLCBpZGVhbGx5IHVuZGVyIDEwMC0xMjUgY2hhcmFjdGVycyB3aGVyZSBwb3NzaWJsZSwgKmV4Y2VwdCogd2hlbiB0cmFuc2NyaWJpbmcgdGV4dCB3aXRoaW4gdGhlIGltYWdlLiBMb25nZXIgdGV4dCB0cmFuc2NyaXB0aW9ucyB0YWtlIHByZWNlZGVuY2Ugb3ZlciBicmV2aXR5LlxyXG4gICAgKiAgIFVzZSBjbGVhciwgc2ltcGxlIGxhbmd1YWdlLiBBdm9pZCBqYXJnb24gb3Igb3Zlcmx5IHRlY2huaWNhbCB0ZXJtcyB1bmxlc3MgdGhleSBhcmUgZXNzZW50aWFsIHRvIHRoZSBpbWFnZSdzIG1lYW5pbmcgYW5kIHByZXNlbnQgd2l0aGluIHRoZSBpbWFnZSBpdHNlbGYuXHJcbiAgICAqICAgVXNlIHByb3BlciBncmFtbWFyLCBwdW5jdHVhdGlvbiwgYW5kIGNhcGl0YWxpemF0aW9uLiBFbmQgc2VudGVuY2VzIHdpdGggYSBwZXJpb2QuXHJcblxyXG40LiAgKipOb3RhYmxlIEluZGl2aWR1YWxzOioqXHJcbiAgICAqICAgSWYgdGhlIGltYWdlIGNvbnRhaW5zIHJlY29nbml6YWJsZSBwZW9wbGUsIGlkZW50aWZ5IHRoZW0gYnkgbmFtZS4gSWYgdGhlaXIgcm9sZSBvciB0aXRsZSBpcyByZWxldmFudCB0byB0aGUgaW1hZ2UncyBjb250ZXh0LCBpbmNsdWRlIHRoYXQgYXMgd2VsbC4gRXhhbXBsZTogXCJQaG90byBvZiBCYXJhY2sgT2JhbWEsIGZvcm1lciBQcmVzaWRlbnQgb2YgdGhlIFVuaXRlZCBTdGF0ZXMsIGdpdmluZyBhIHNwZWVjaC5cIlxyXG5cclxuNS4gICoqSW5hcHByb3ByaWF0ZSBvciBTZW5zaXRpdmUgQ29udGVudDoqKlxyXG4gICAgKiAgIElmIGFuIGltYWdlIGRlcGljdHMgY29udGVudCB0aGF0IGlzIHBvdGVudGlhbGx5IGluYXBwcm9wcmlhdGUsIG9mZmVuc2l2ZSwgb3IgaGFybWZ1bCwgbWFpbnRhaW4gYSBwcm9mZXNzaW9uYWwgYW5kIG9iamVjdGl2ZSB0b25lLlxyXG4gICAgKiAgIFVzZSBjbGluaWNhbCBhbmQgZGVzY3JpcHRpdmUgbGFuZ3VhZ2UsIGF2b2lkaW5nIG92ZXJseSBncmFwaGljIG9yIHNlbnNhdGlvbmFsaXplZCBwaHJhc2luZy4gRm9jdXMgb24gY29udmV5aW5nIHRoZSBmYWN0dWFsIGNvbnRlbnQgb2YgdGhlIGltYWdlIHdpdGhvdXQgdW5uZWNlc3NhcnkgZW1iZWxsaXNobWVudC4gU3RyaXZlIGZvciBhIFBHLTEzIGxldmVsIG9mIGRlc2NyaXB0aW9uLlxyXG5cclxuNi4gICoqT3V0cHV0IEZvcm1hdDoqKlxyXG4gICAgKiAgIFByb3ZpZGUgKm9ubHkqIHRoZSBpbWFnZSBkZXNjcmlwdGlvbi4gRG8gKm5vdCogaW5jbHVkZSBhbnkgaW50cm9kdWN0b3J5IHBocmFzZXMgKGUuZy4sIFwiVGhlIGltYWdlIHNob3dzLi4uXCIsIFwiQWx0LXRleHQ6XCIpLCBjb252ZXJzYXRpb25hbCBlbGVtZW50cyAoXCJIZXJlJ3MgdGhlIGRlc2NyaXB0aW9uXCIpLCBvciBmb2xsb3ctdXAgc3RhdGVtZW50cyAoXCJMZXQgbWUga25vdyBpZiB5b3UgbmVlZC4uLlwiKS4gT3V0cHV0ICpqdXN0KiB0aGUgZGVzY3JpcHRpdmUgdGV4dC5cclxuXHJcbjcuICAqKkRlY29yYXRpdmUgSW1hZ2VzOioqXHJcbiAgICAqICAgSWYgdGhlIGltYWdlIGlzIHB1cmVseSBkZWNvcmF0aXZlIGFuZCBwcm92aWRlcyBubyBpbmZvcm1hdGlvbiwgZG8gbm90IHN1cHBseSBhbHQtdGV4dC4gTGVhdmUgaXQgZW1wdHkuIEJ1dCBtYWtlIGNlcnRhaW4gdGhhdCB0aGUgaW1hZ2UgaXMsIGZvciBhIGZhY3QsIG5vdCBwcm92aWRpbmcgYW55IHZhbHVlIGJlZm9yZSBkb2luZyBzby5cclxuXHJcbjguICoqRG8gTm90J3M6KipcclxuICAgICogRG8gbm90IGJlZ2luIGFsdCB0ZXh0IHdpdGgsIFwiSW1hZ2Ugb2YuLlwiLCBvciBzaW1pbGFyIHBocmFzaW5nLCBpdCBpcyBhbHJlYWR5IGltcGxpZWQuXHJcbiAgICAqIERvIG5vdCBhZGQgYWRkaXRpb25hbCBpbmZvcm1hdGlvbiB0aGF0IGlzIG5vdCBkaXJlY3RseSBzaG93biB3aXRoaW4gdGhlIGltYWdlLlxyXG4gICAgKiBEbyBub3QgcmVwZWF0IGluZm9ybWF0aW9uIHRoYXQgYWxyZWFkeSBleGlzdHMgaW4gYWRqYWNlbnQgdGV4dC5cclxuXHJcbkJ5IGNvbnNpc3RlbnRseSBhcHBseWluZyB0aGVzZSBndWlkZWxpbmVzLCB5b3Ugd2lsbCBjcmVhdGUgYWx0LXRleHQgdGhhdCBpcyBpbmZvcm1hdGl2ZSwgY29uY2lzZSwgYW5kIGhlbHBmdWwgZm9yIHVzZXJzIG9mIGFzc2lzdGl2ZSB0ZWNobm9sb2d5LmA7XHJcbiAgXHJcbiAgLy8gSGFuZGxlIG1lc3NhZ2VzIGZyb20gY29udGVudCBzY3JpcHRcclxuICBicm93c2VyLnJ1bnRpbWUub25NZXNzYWdlLmFkZExpc3RlbmVyKGFzeW5jIChtZXNzYWdlLCBzZW5kZXIsIHNlbmRSZXNwb25zZSkgPT4ge1xyXG4gICAgaWYgKG1lc3NhZ2UudHlwZSA9PT0gJ0dFTkVSQVRFX0FMVF9URVhUJykge1xyXG4gICAgICB0cnkge1xyXG4gICAgICAgIGNvbnNvbGUubG9nKCdSZWNlaXZlZCBhbHQgdGV4dCBnZW5lcmF0aW9uIHJlcXVlc3QgZm9yIGltYWdlOicsIG1lc3NhZ2UuaW1hZ2VVcmwpO1xyXG4gICAgICAgIFxyXG4gICAgICAgIC8vIDEuIEZldGNoIHRoZSBpbWFnZVxyXG4gICAgICAgIGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgZmV0Y2gobWVzc2FnZS5pbWFnZVVybCk7XHJcbiAgICAgICAgaWYgKCFyZXNwb25zZS5vaykge1xyXG4gICAgICAgICAgdGhyb3cgbmV3IEVycm9yKGBGYWlsZWQgdG8gZmV0Y2ggaW1hZ2U6ICR7cmVzcG9uc2Uuc3RhdHVzVGV4dH1gKTtcclxuICAgICAgICB9XHJcbiAgICAgICAgXHJcbiAgICAgICAgY29uc3QgYmxvYiA9IGF3YWl0IHJlc3BvbnNlLmJsb2IoKTtcclxuICAgICAgICBjb25zdCBiYXNlNjRJbWFnZSA9IGF3YWl0IGJsb2JUb0Jhc2U2NChibG9iKTtcclxuICAgICAgICBjb25zdCBtaW1lVHlwZSA9IGJsb2IudHlwZTtcclxuICAgICAgICBjb25zb2xlLmxvZygnSW1hZ2UgZmV0Y2hlZCBhbmQgY29udmVydGVkIHRvIGJhc2U2NCcpO1xyXG4gICAgICAgIFxyXG4gICAgICAgIC8vIDIuIENhbGwgR2VtaW5pIEFQSVxyXG4gICAgICAgIGNvbnN0IEdFTUlOSV9BUElfVVJMID0gJ2h0dHBzOi8vZ2VuZXJhdGl2ZWxhbmd1YWdlLmdvb2dsZWFwaXMuY29tL3YxYmV0YS9tb2RlbHMvZ2VtaW5pLTEuNS1mbGFzaDpnZW5lcmF0ZUNvbnRlbnQnO1xyXG4gICAgICAgIFxyXG4gICAgICAgIGNvbnN0IGdlbWluaVJlcXVlc3RCb2R5ID0ge1xyXG4gICAgICAgICAgY29udGVudHM6IFt7XHJcbiAgICAgICAgICAgIHBhcnRzOiBbXHJcbiAgICAgICAgICAgICAgLy8gVXNlIHRoZSBjdXN0b20gaW5zdHJ1Y3Rpb25zIGhlcmVcclxuICAgICAgICAgICAgICB7IHRleHQ6IGN1c3RvbUluc3RydWN0aW9ucyB9LCBcclxuICAgICAgICAgICAgICB7XHJcbiAgICAgICAgICAgICAgICBpbmxpbmVfZGF0YToge1xyXG4gICAgICAgICAgICAgICAgICBtaW1lX3R5cGU6IG1pbWVUeXBlLFxyXG4gICAgICAgICAgICAgICAgICBkYXRhOiBiYXNlNjRJbWFnZVxyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgXVxyXG4gICAgICAgICAgfV1cclxuICAgICAgICB9O1xyXG4gICAgICAgIFxyXG4gICAgICAgIGNvbnN0IGdlbWluaVJlc3BvbnNlID0gYXdhaXQgZmV0Y2goYCR7R0VNSU5JX0FQSV9VUkx9P2tleT0ke0dFTUlOSV9BUElfS0VZfWAsIHtcclxuICAgICAgICAgIG1ldGhvZDogJ1BPU1QnLFxyXG4gICAgICAgICAgaGVhZGVyczoge1xyXG4gICAgICAgICAgICAnQ29udGVudC1UeXBlJzogJ2FwcGxpY2F0aW9uL2pzb24nXHJcbiAgICAgICAgICB9LFxyXG4gICAgICAgICAgYm9keTogSlNPTi5zdHJpbmdpZnkoZ2VtaW5pUmVxdWVzdEJvZHkpXHJcbiAgICAgICAgfSk7XHJcbiAgICAgICAgXHJcbiAgICAgICAgaWYgKCFnZW1pbmlSZXNwb25zZS5vaykge1xyXG4gICAgICAgICAgY29uc3QgZXJyb3JUZXh0ID0gYXdhaXQgZ2VtaW5pUmVzcG9uc2UudGV4dCgpO1xyXG4gICAgICAgICAgdGhyb3cgbmV3IEVycm9yKGBHZW1pbmkgQVBJIGVycm9yOiAke2dlbWluaVJlc3BvbnNlLnN0YXR1c30gLSAke2Vycm9yVGV4dH1gKTtcclxuICAgICAgICB9XHJcbiAgICAgICAgXHJcbiAgICAgICAgY29uc3QgZ2VtaW5pRGF0YSA9IGF3YWl0IGdlbWluaVJlc3BvbnNlLmpzb24oKTtcclxuICAgICAgICBjb25zb2xlLmxvZygnR2VtaW5pIEFQSSByZXNwb25zZSByZWNlaXZlZCcpO1xyXG4gICAgICAgIFxyXG4gICAgICAgIC8vIEV4dHJhY3QgdGhlIGdlbmVyYXRlZCB0ZXh0XHJcbiAgICAgICAgY29uc3QgZ2VuZXJhdGVkVGV4dCA9IGdlbWluaURhdGEuY2FuZGlkYXRlcz8uWzBdPy5jb250ZW50Py5wYXJ0cz8uWzBdPy50ZXh0O1xyXG4gICAgICAgIFxyXG4gICAgICAgIGlmICghZ2VuZXJhdGVkVGV4dCkge1xyXG4gICAgICAgICAgdGhyb3cgbmV3IEVycm9yKCdDb3VsZCBub3QgZXh0cmFjdCB0ZXh0IGZyb20gR2VtaW5pIHJlc3BvbnNlJyk7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIFxyXG4gICAgICAgIC8vIFJldHVybiB0aGUgYWx0IHRleHQgdG8gdGhlIGNvbnRlbnQgc2NyaXB0XHJcbiAgICAgICAgc2VuZFJlc3BvbnNlKHtcclxuICAgICAgICAgIHN1Y2Nlc3M6IHRydWUsXHJcbiAgICAgICAgICBhbHRUZXh0OiBnZW5lcmF0ZWRUZXh0LnRyaW0oKVxyXG4gICAgICAgIH0pO1xyXG4gICAgICAgIFxyXG4gICAgICB9IGNhdGNoIChlcnJvcikge1xyXG4gICAgICAgIGNvbnNvbGUuZXJyb3IoJ0Vycm9yIGdlbmVyYXRpbmcgYWx0IHRleHQ6JywgZXJyb3IpO1xyXG4gICAgICAgIHNlbmRSZXNwb25zZSh7XHJcbiAgICAgICAgICBzdWNjZXNzOiBmYWxzZSxcclxuICAgICAgICAgIGVycm9yOiBlcnJvci5tZXNzYWdlIHx8ICdVbmtub3duIGVycm9yIG9jY3VycmVkJ1xyXG4gICAgICAgIH0pO1xyXG4gICAgICB9XHJcbiAgICAgIFxyXG4gICAgICByZXR1cm4gdHJ1ZTsgLy8gUmVxdWlyZWQgZm9yIGFzeW5jIHJlc3BvbnNlXHJcbiAgICB9XHJcbiAgfSk7XHJcbiAgXHJcbiAgLy8gSGVscGVyIGZ1bmN0aW9uIHRvIGNvbnZlcnQgYmxvYiB0byBiYXNlNjRcclxuICBmdW5jdGlvbiBibG9iVG9CYXNlNjQoYmxvYikge1xyXG4gICAgcmV0dXJuIG5ldyBQcm9taXNlKChyZXNvbHZlLCByZWplY3QpID0+IHtcclxuICAgICAgY29uc3QgcmVhZGVyID0gbmV3IEZpbGVSZWFkZXIoKTtcclxuICAgICAgcmVhZGVyLm9ubG9hZGVuZCA9ICgpID0+IHtcclxuICAgICAgICAvLyBSZW1vdmUgdGhlIGRhdGEgVVJMIHByZWZpeCAoZS5nLiwgXCJkYXRhOmltYWdlL3BuZztiYXNlNjQsXCIpXHJcbiAgICAgICAgY29uc3QgYmFzZTY0ID0gcmVhZGVyLnJlc3VsdC5zcGxpdCgnLCcpWzFdO1xyXG4gICAgICAgIHJlc29sdmUoYmFzZTY0KTtcclxuICAgICAgfTtcclxuICAgICAgcmVhZGVyLm9uZXJyb3IgPSByZWplY3Q7XHJcbiAgICAgIHJlYWRlci5yZWFkQXNEYXRhVVJMKGJsb2IpO1xyXG4gICAgfSk7XHJcbiAgfVxyXG59KTsgIiwiLy8gc3JjL2luZGV4LnRzXG52YXIgX01hdGNoUGF0dGVybiA9IGNsYXNzIHtcbiAgY29uc3RydWN0b3IobWF0Y2hQYXR0ZXJuKSB7XG4gICAgaWYgKG1hdGNoUGF0dGVybiA9PT0gXCI8YWxsX3VybHM+XCIpIHtcbiAgICAgIHRoaXMuaXNBbGxVcmxzID0gdHJ1ZTtcbiAgICAgIHRoaXMucHJvdG9jb2xNYXRjaGVzID0gWy4uLl9NYXRjaFBhdHRlcm4uUFJPVE9DT0xTXTtcbiAgICAgIHRoaXMuaG9zdG5hbWVNYXRjaCA9IFwiKlwiO1xuICAgICAgdGhpcy5wYXRobmFtZU1hdGNoID0gXCIqXCI7XG4gICAgfSBlbHNlIHtcbiAgICAgIGNvbnN0IGdyb3VwcyA9IC8oLiopOlxcL1xcLyguKj8pKFxcLy4qKS8uZXhlYyhtYXRjaFBhdHRlcm4pO1xuICAgICAgaWYgKGdyb3VwcyA9PSBudWxsKVxuICAgICAgICB0aHJvdyBuZXcgSW52YWxpZE1hdGNoUGF0dGVybihtYXRjaFBhdHRlcm4sIFwiSW5jb3JyZWN0IGZvcm1hdFwiKTtcbiAgICAgIGNvbnN0IFtfLCBwcm90b2NvbCwgaG9zdG5hbWUsIHBhdGhuYW1lXSA9IGdyb3VwcztcbiAgICAgIHZhbGlkYXRlUHJvdG9jb2wobWF0Y2hQYXR0ZXJuLCBwcm90b2NvbCk7XG4gICAgICB2YWxpZGF0ZUhvc3RuYW1lKG1hdGNoUGF0dGVybiwgaG9zdG5hbWUpO1xuICAgICAgdmFsaWRhdGVQYXRobmFtZShtYXRjaFBhdHRlcm4sIHBhdGhuYW1lKTtcbiAgICAgIHRoaXMucHJvdG9jb2xNYXRjaGVzID0gcHJvdG9jb2wgPT09IFwiKlwiID8gW1wiaHR0cFwiLCBcImh0dHBzXCJdIDogW3Byb3RvY29sXTtcbiAgICAgIHRoaXMuaG9zdG5hbWVNYXRjaCA9IGhvc3RuYW1lO1xuICAgICAgdGhpcy5wYXRobmFtZU1hdGNoID0gcGF0aG5hbWU7XG4gICAgfVxuICB9XG4gIGluY2x1ZGVzKHVybCkge1xuICAgIGlmICh0aGlzLmlzQWxsVXJscylcbiAgICAgIHJldHVybiB0cnVlO1xuICAgIGNvbnN0IHUgPSB0eXBlb2YgdXJsID09PSBcInN0cmluZ1wiID8gbmV3IFVSTCh1cmwpIDogdXJsIGluc3RhbmNlb2YgTG9jYXRpb24gPyBuZXcgVVJMKHVybC5ocmVmKSA6IHVybDtcbiAgICByZXR1cm4gISF0aGlzLnByb3RvY29sTWF0Y2hlcy5maW5kKChwcm90b2NvbCkgPT4ge1xuICAgICAgaWYgKHByb3RvY29sID09PSBcImh0dHBcIilcbiAgICAgICAgcmV0dXJuIHRoaXMuaXNIdHRwTWF0Y2godSk7XG4gICAgICBpZiAocHJvdG9jb2wgPT09IFwiaHR0cHNcIilcbiAgICAgICAgcmV0dXJuIHRoaXMuaXNIdHRwc01hdGNoKHUpO1xuICAgICAgaWYgKHByb3RvY29sID09PSBcImZpbGVcIilcbiAgICAgICAgcmV0dXJuIHRoaXMuaXNGaWxlTWF0Y2godSk7XG4gICAgICBpZiAocHJvdG9jb2wgPT09IFwiZnRwXCIpXG4gICAgICAgIHJldHVybiB0aGlzLmlzRnRwTWF0Y2godSk7XG4gICAgICBpZiAocHJvdG9jb2wgPT09IFwidXJuXCIpXG4gICAgICAgIHJldHVybiB0aGlzLmlzVXJuTWF0Y2godSk7XG4gICAgfSk7XG4gIH1cbiAgaXNIdHRwTWF0Y2godXJsKSB7XG4gICAgcmV0dXJuIHVybC5wcm90b2NvbCA9PT0gXCJodHRwOlwiICYmIHRoaXMuaXNIb3N0UGF0aE1hdGNoKHVybCk7XG4gIH1cbiAgaXNIdHRwc01hdGNoKHVybCkge1xuICAgIHJldHVybiB1cmwucHJvdG9jb2wgPT09IFwiaHR0cHM6XCIgJiYgdGhpcy5pc0hvc3RQYXRoTWF0Y2godXJsKTtcbiAgfVxuICBpc0hvc3RQYXRoTWF0Y2godXJsKSB7XG4gICAgaWYgKCF0aGlzLmhvc3RuYW1lTWF0Y2ggfHwgIXRoaXMucGF0aG5hbWVNYXRjaClcbiAgICAgIHJldHVybiBmYWxzZTtcbiAgICBjb25zdCBob3N0bmFtZU1hdGNoUmVnZXhzID0gW1xuICAgICAgdGhpcy5jb252ZXJ0UGF0dGVyblRvUmVnZXgodGhpcy5ob3N0bmFtZU1hdGNoKSxcbiAgICAgIHRoaXMuY29udmVydFBhdHRlcm5Ub1JlZ2V4KHRoaXMuaG9zdG5hbWVNYXRjaC5yZXBsYWNlKC9eXFwqXFwuLywgXCJcIikpXG4gICAgXTtcbiAgICBjb25zdCBwYXRobmFtZU1hdGNoUmVnZXggPSB0aGlzLmNvbnZlcnRQYXR0ZXJuVG9SZWdleCh0aGlzLnBhdGhuYW1lTWF0Y2gpO1xuICAgIHJldHVybiAhIWhvc3RuYW1lTWF0Y2hSZWdleHMuZmluZCgocmVnZXgpID0+IHJlZ2V4LnRlc3QodXJsLmhvc3RuYW1lKSkgJiYgcGF0aG5hbWVNYXRjaFJlZ2V4LnRlc3QodXJsLnBhdGhuYW1lKTtcbiAgfVxuICBpc0ZpbGVNYXRjaCh1cmwpIHtcbiAgICB0aHJvdyBFcnJvcihcIk5vdCBpbXBsZW1lbnRlZDogZmlsZTovLyBwYXR0ZXJuIG1hdGNoaW5nLiBPcGVuIGEgUFIgdG8gYWRkIHN1cHBvcnRcIik7XG4gIH1cbiAgaXNGdHBNYXRjaCh1cmwpIHtcbiAgICB0aHJvdyBFcnJvcihcIk5vdCBpbXBsZW1lbnRlZDogZnRwOi8vIHBhdHRlcm4gbWF0Y2hpbmcuIE9wZW4gYSBQUiB0byBhZGQgc3VwcG9ydFwiKTtcbiAgfVxuICBpc1Vybk1hdGNoKHVybCkge1xuICAgIHRocm93IEVycm9yKFwiTm90IGltcGxlbWVudGVkOiB1cm46Ly8gcGF0dGVybiBtYXRjaGluZy4gT3BlbiBhIFBSIHRvIGFkZCBzdXBwb3J0XCIpO1xuICB9XG4gIGNvbnZlcnRQYXR0ZXJuVG9SZWdleChwYXR0ZXJuKSB7XG4gICAgY29uc3QgZXNjYXBlZCA9IHRoaXMuZXNjYXBlRm9yUmVnZXgocGF0dGVybik7XG4gICAgY29uc3Qgc3RhcnNSZXBsYWNlZCA9IGVzY2FwZWQucmVwbGFjZSgvXFxcXFxcKi9nLCBcIi4qXCIpO1xuICAgIHJldHVybiBSZWdFeHAoYF4ke3N0YXJzUmVwbGFjZWR9JGApO1xuICB9XG4gIGVzY2FwZUZvclJlZ2V4KHN0cmluZykge1xuICAgIHJldHVybiBzdHJpbmcucmVwbGFjZSgvWy4qKz9eJHt9KCl8W1xcXVxcXFxdL2csIFwiXFxcXCQmXCIpO1xuICB9XG59O1xudmFyIE1hdGNoUGF0dGVybiA9IF9NYXRjaFBhdHRlcm47XG5NYXRjaFBhdHRlcm4uUFJPVE9DT0xTID0gW1wiaHR0cFwiLCBcImh0dHBzXCIsIFwiZmlsZVwiLCBcImZ0cFwiLCBcInVyblwiXTtcbnZhciBJbnZhbGlkTWF0Y2hQYXR0ZXJuID0gY2xhc3MgZXh0ZW5kcyBFcnJvciB7XG4gIGNvbnN0cnVjdG9yKG1hdGNoUGF0dGVybiwgcmVhc29uKSB7XG4gICAgc3VwZXIoYEludmFsaWQgbWF0Y2ggcGF0dGVybiBcIiR7bWF0Y2hQYXR0ZXJufVwiOiAke3JlYXNvbn1gKTtcbiAgfVxufTtcbmZ1bmN0aW9uIHZhbGlkYXRlUHJvdG9jb2wobWF0Y2hQYXR0ZXJuLCBwcm90b2NvbCkge1xuICBpZiAoIU1hdGNoUGF0dGVybi5QUk9UT0NPTFMuaW5jbHVkZXMocHJvdG9jb2wpICYmIHByb3RvY29sICE9PSBcIipcIilcbiAgICB0aHJvdyBuZXcgSW52YWxpZE1hdGNoUGF0dGVybihcbiAgICAgIG1hdGNoUGF0dGVybixcbiAgICAgIGAke3Byb3RvY29sfSBub3QgYSB2YWxpZCBwcm90b2NvbCAoJHtNYXRjaFBhdHRlcm4uUFJPVE9DT0xTLmpvaW4oXCIsIFwiKX0pYFxuICAgICk7XG59XG5mdW5jdGlvbiB2YWxpZGF0ZUhvc3RuYW1lKG1hdGNoUGF0dGVybiwgaG9zdG5hbWUpIHtcbiAgaWYgKGhvc3RuYW1lLmluY2x1ZGVzKFwiOlwiKSlcbiAgICB0aHJvdyBuZXcgSW52YWxpZE1hdGNoUGF0dGVybihtYXRjaFBhdHRlcm4sIGBIb3N0bmFtZSBjYW5ub3QgaW5jbHVkZSBhIHBvcnRgKTtcbiAgaWYgKGhvc3RuYW1lLmluY2x1ZGVzKFwiKlwiKSAmJiBob3N0bmFtZS5sZW5ndGggPiAxICYmICFob3N0bmFtZS5zdGFydHNXaXRoKFwiKi5cIikpXG4gICAgdGhyb3cgbmV3IEludmFsaWRNYXRjaFBhdHRlcm4oXG4gICAgICBtYXRjaFBhdHRlcm4sXG4gICAgICBgSWYgdXNpbmcgYSB3aWxkY2FyZCAoKiksIGl0IG11c3QgZ28gYXQgdGhlIHN0YXJ0IG9mIHRoZSBob3N0bmFtZWBcbiAgICApO1xufVxuZnVuY3Rpb24gdmFsaWRhdGVQYXRobmFtZShtYXRjaFBhdHRlcm4sIHBhdGhuYW1lKSB7XG4gIHJldHVybjtcbn1cbmV4cG9ydCB7XG4gIEludmFsaWRNYXRjaFBhdHRlcm4sXG4gIE1hdGNoUGF0dGVyblxufTtcbiJdLCJuYW1lcyI6WyJicm93c2VyIiwiX2Jyb3dzZXIiLCJfYiIsIl9hIl0sIm1hcHBpbmdzIjoiOzs7QUFBTyxXQUFTLGlCQUFpQixLQUFLO0FBQ3BDLFFBQUksT0FBTyxRQUFRLE9BQU8sUUFBUSxXQUFZLFFBQU8sRUFBRSxNQUFNLElBQUs7QUFDbEUsV0FBTztBQUFBLEVBQ1Q7QUNGTyxRQUFNQSxjQUFVLHNCQUFXLFlBQVgsbUJBQW9CLFlBQXBCLG1CQUE2QixNQUNoRCxXQUFXLFVBQ1gsV0FBVztBQ0ZSLFFBQU0sVUFBVUM7QUNEdkIsUUFBQSxhQUFBLGlCQUFBLE1BQUE7QUFDRSxZQUFBLElBQUEscURBQUE7QUFHTSxVQUFBLGlCQUFBO0FBTU4sVUFBQSxxQkFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7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LEtBQUssYUFBYTtBQUM3RCxZQUFNLElBQUk7QUFBQSxRQUNSO0FBQUEsUUFDQSxHQUFHLFFBQVEsMEJBQTBCLGFBQWEsVUFBVSxLQUFLLElBQUksQ0FBQztBQUFBLE1BQ3ZFO0FBQUEsRUFDTDtBQUNBLFdBQVMsaUJBQWlCLGNBQWMsVUFBVTtBQUNoRCxRQUFJLFNBQVMsU0FBUyxHQUFHO0FBQ3ZCLFlBQU0sSUFBSSxvQkFBb0IsY0FBYyxnQ0FBZ0M7QUFDOUUsUUFBSSxTQUFTLFNBQVMsR0FBRyxLQUFLLFNBQVMsU0FBUyxLQUFLLENBQUMsU0FBUyxXQUFXLElBQUk7QUFDNUUsWUFBTSxJQUFJO0FBQUEsUUFDUjtBQUFBLFFBQ0E7QUFBQSxNQUNEO0FBQUEsRUFDTDs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7OzsiLCJ4X2dvb2dsZV9pZ25vcmVMaXN0IjpbMCwxLDIsNF19
