var bskyaltgenerator = function() {
  "use strict";var __defProp = Object.defineProperty;
var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
var __publicField = (obj, key, value) => __defNormalProp(obj, typeof key !== "symbol" ? key + "" : key, value);

  var _a, _b;
  function defineContentScript(definition2) {
    return definition2;
  }
  const definition = defineContentScript({
    matches: ["*://*.bsky.app/*"],
    main() {
      console.log("Bluesky Alt Text Generator loaded");
      if (typeof window === "undefined" || typeof document === "undefined") {
        return;
      }
      const ALT_TEXT_SELECTOR = 'textarea[aria-label="Alt text"]';
      const BUTTON_ID = "gemini-alt-text-button";
      function addGenerateButton(textarea) {
        var _a2, _b2, _c;
        console.log("addGenerateButton called for textarea:", textarea);
        if (textarea.dataset.geminiButtonAdded === "true") {
          console.log("Button already added to this textarea, skipping.");
          return;
        }
        let container = textarea.closest('div[data-testid="composer"]');
        if (!container) {
          container = (_b2 = (_a2 = textarea.parentElement) == null ? void 0 : _a2.parentElement) == null ? void 0 : _b2.parentElement;
          console.log("Using fallback container:", container);
        } else {
          console.log("Found container via closest():", container);
        }
        if (!container) {
          console.error("Could not find a suitable container for the button near textarea:", textarea);
          return;
        }
        if (container.querySelector(`#${BUTTON_ID}`)) {
          console.log("Button already exists in this container, skipping.");
          return;
        }
        const button = document.createElement("button");
        button.id = BUTTON_ID;
        button.textContent = "Gen Alt Text";
        button.style.marginLeft = "8px";
        button.style.padding = "2px 8px";
        button.style.fontSize = "0.9em";
        button.style.cursor = "pointer";
        button.style.border = "1px solid #ccc";
        button.style.borderRadius = "4px";
        button.style.backgroundColor = "#f0f0f0";
        console.log("Button element created:", button);
        button.onclick = async (e) => {
          e.preventDefault();
          e.stopPropagation();
          console.log("Generate Alt Text button clicked");
          button.textContent = "Generating...";
          button.disabled = true;
          const imageElement = container == null ? void 0 : container.querySelector('img[alt="Image preview"], img[draggable="true"]');
          if (!imageElement) {
            console.error("Could not find the image element near the button.");
            button.textContent = "Error: No Image";
            setTimeout(() => {
              button.textContent = "Gen Alt Text";
              button.disabled = false;
            }, 2e3);
            return;
          }
          console.log("Found image element:", imageElement);
          const imageUrl = imageElement.src;
          if (!imageUrl) {
            console.error("Image element found, but src attribute is missing or empty.");
            button.textContent = "Error: No URL";
            setTimeout(() => {
              button.textContent = "Gen Alt Text";
              button.disabled = false;
            }, 2e3);
            return;
          }
          console.log("Image URL:", imageUrl);
          try {
            const response = await chrome.runtime.sendMessage({
              action: "generateAltText",
              imageData: { url: imageUrl }
              // Sending URL for now
            });
            console.log("Received response from background script:", response);
            if (response.altText) {
              textarea.value = response.altText;
              textarea.dispatchEvent(new Event("input", { bubbles: true, cancelable: true }));
              console.log("Alt text inserted.");
              button.textContent = "✓ Done";
              setTimeout(() => {
                button.textContent = "Gen Alt Text";
                button.disabled = false;
              }, 1500);
            } else if (response.error) {
              console.error("Error generating alt text:", response.error);
              button.textContent = `Error: ${response.error.substring(0, 20)}...`;
              setTimeout(() => {
                button.textContent = "Gen Alt Text";
                button.disabled = false;
              }, 3e3);
            }
          } catch (error) {
            console.error("Error sending message to background script or processing response:", error);
            button.textContent = "Error";
            setTimeout(() => {
              button.textContent = "Gen Alt Text";
              button.disabled = false;
            }, 2e3);
          } finally {
          }
        };
        console.log("Attempting to insert button next to textarea:", textarea);
        (_c = textarea.parentNode) == null ? void 0 : _c.insertBefore(button, textarea.nextSibling);
        textarea.dataset.geminiButtonAdded = "true";
        console.log("Button insertion attempted. Check the DOM.");
      }
      document.querySelectorAll(ALT_TEXT_SELECTOR).forEach((textarea) => {
        addGenerateButton(textarea);
      });
      const observer = new MutationObserver((mutations) => {
        console.log("MutationObserver callback triggered.");
        for (const mutation of mutations) {
          if (mutation.type === "childList") {
            mutation.addedNodes.forEach((node) => {
              if (node.nodeType === Node.ELEMENT_NODE) {
                const element = node;
                if (element.matches && element.matches(ALT_TEXT_SELECTOR)) {
                  console.log("Observer found matching textarea directly:", element);
                  addGenerateButton(element);
                } else if (element.querySelectorAll) {
                  element.querySelectorAll(ALT_TEXT_SELECTOR).forEach((textarea) => {
                    console.log("Observer found matching textarea within added node:", textarea);
                    addGenerateButton(textarea);
                  });
                }
              }
            });
          }
        }
      });
      observer.observe(document.body, {
        childList: true,
        subtree: true
      });
      console.log("Alt text generator initialized and watching for textareas");
    }
  });
  bskyaltgenerator;
  const browser$1 = ((_b = (_a = globalThis.browser) == null ? void 0 : _a.runtime) == null ? void 0 : _b.id) ? globalThis.browser : globalThis.chrome;
  const browser = browser$1;
  function print$1(method, ...args) {
    if (typeof args[0] === "string") {
      const message = args.shift();
      method(`[wxt] ${message}`, ...args);
    } else {
      method("[wxt]", ...args);
    }
  }
  const logger$1 = {
    debug: (...args) => print$1(console.debug, ...args),
    log: (...args) => print$1(console.log, ...args),
    warn: (...args) => print$1(console.warn, ...args),
    error: (...args) => print$1(console.error, ...args)
  };
  const _WxtLocationChangeEvent = class _WxtLocationChangeEvent extends Event {
    constructor(newUrl, oldUrl) {
      super(_WxtLocationChangeEvent.EVENT_NAME, {});
      this.newUrl = newUrl;
      this.oldUrl = oldUrl;
    }
  };
  __publicField(_WxtLocationChangeEvent, "EVENT_NAME", getUniqueEventName("wxt:locationchange"));
  let WxtLocationChangeEvent = _WxtLocationChangeEvent;
  function getUniqueEventName(eventName) {
    var _a2;
    return `${(_a2 = browser == null ? void 0 : browser.runtime) == null ? void 0 : _a2.id}:${"bsky_alt_generator"}:${eventName}`;
  }
  function createLocationWatcher(ctx) {
    let interval;
    let oldUrl;
    return {
      /**
       * Ensure the location watcher is actively looking for URL changes. If it's already watching,
       * this is a noop.
       */
      run() {
        if (interval != null) return;
        oldUrl = new URL(location.href);
        interval = ctx.setInterval(() => {
          let newUrl = new URL(location.href);
          if (newUrl.href !== oldUrl.href) {
            window.dispatchEvent(new WxtLocationChangeEvent(newUrl, oldUrl));
            oldUrl = newUrl;
          }
        }, 1e3);
      }
    };
  }
  const _ContentScriptContext = class _ContentScriptContext {
    constructor(contentScriptName, options) {
      __publicField(this, "isTopFrame", window.self === window.top);
      __publicField(this, "abortController");
      __publicField(this, "locationWatcher", createLocationWatcher(this));
      __publicField(this, "receivedMessageIds", /* @__PURE__ */ new Set());
      this.contentScriptName = contentScriptName;
      this.options = options;
      this.abortController = new AbortController();
      if (this.isTopFrame) {
        this.listenForNewerScripts({ ignoreFirstEvent: true });
        this.stopOldScripts();
      } else {
        this.listenForNewerScripts();
      }
    }
    get signal() {
      return this.abortController.signal;
    }
    abort(reason) {
      return this.abortController.abort(reason);
    }
    get isInvalid() {
      if (browser.runtime.id == null) {
        this.notifyInvalidated();
      }
      return this.signal.aborted;
    }
    get isValid() {
      return !this.isInvalid;
    }
    /**
     * Add a listener that is called when the content script's context is invalidated.
     *
     * @returns A function to remove the listener.
     *
     * @example
     * browser.runtime.onMessage.addListener(cb);
     * const removeInvalidatedListener = ctx.onInvalidated(() => {
     *   browser.runtime.onMessage.removeListener(cb);
     * })
     * // ...
     * removeInvalidatedListener();
     */
    onInvalidated(cb) {
      this.signal.addEventListener("abort", cb);
      return () => this.signal.removeEventListener("abort", cb);
    }
    /**
     * Return a promise that never resolves. Useful if you have an async function that shouldn't run
     * after the context is expired.
     *
     * @example
     * const getValueFromStorage = async () => {
     *   if (ctx.isInvalid) return ctx.block();
     *
     *   // ...
     * }
     */
    block() {
      return new Promise(() => {
      });
    }
    /**
     * Wrapper around `window.setInterval` that automatically clears the interval when invalidated.
     */
    setInterval(handler, timeout) {
      const id = setInterval(() => {
        if (this.isValid) handler();
      }, timeout);
      this.onInvalidated(() => clearInterval(id));
      return id;
    }
    /**
     * Wrapper around `window.setTimeout` that automatically clears the interval when invalidated.
     */
    setTimeout(handler, timeout) {
      const id = setTimeout(() => {
        if (this.isValid) handler();
      }, timeout);
      this.onInvalidated(() => clearTimeout(id));
      return id;
    }
    /**
     * Wrapper around `window.requestAnimationFrame` that automatically cancels the request when
     * invalidated.
     */
    requestAnimationFrame(callback) {
      const id = requestAnimationFrame((...args) => {
        if (this.isValid) callback(...args);
      });
      this.onInvalidated(() => cancelAnimationFrame(id));
      return id;
    }
    /**
     * Wrapper around `window.requestIdleCallback` that automatically cancels the request when
     * invalidated.
     */
    requestIdleCallback(callback, options) {
      const id = requestIdleCallback((...args) => {
        if (!this.signal.aborted) callback(...args);
      }, options);
      this.onInvalidated(() => cancelIdleCallback(id));
      return id;
    }
    addEventListener(target, type, handler, options) {
      var _a2;
      if (type === "wxt:locationchange") {
        if (this.isValid) this.locationWatcher.run();
      }
      (_a2 = target.addEventListener) == null ? void 0 : _a2.call(
        target,
        type.startsWith("wxt:") ? getUniqueEventName(type) : type,
        handler,
        {
          ...options,
          signal: this.signal
        }
      );
    }
    /**
     * @internal
     * Abort the abort controller and execute all `onInvalidated` listeners.
     */
    notifyInvalidated() {
      this.abort("Content script context invalidated");
      logger$1.debug(
        `Content script "${this.contentScriptName}" context invalidated`
      );
    }
    stopOldScripts() {
      window.postMessage(
        {
          type: _ContentScriptContext.SCRIPT_STARTED_MESSAGE_TYPE,
          contentScriptName: this.contentScriptName,
          messageId: Math.random().toString(36).slice(2)
        },
        "*"
      );
    }
    verifyScriptStartedEvent(event) {
      var _a2, _b2, _c;
      const isScriptStartedEvent = ((_a2 = event.data) == null ? void 0 : _a2.type) === _ContentScriptContext.SCRIPT_STARTED_MESSAGE_TYPE;
      const isSameContentScript = ((_b2 = event.data) == null ? void 0 : _b2.contentScriptName) === this.contentScriptName;
      const isNotDuplicate = !this.receivedMessageIds.has((_c = event.data) == null ? void 0 : _c.messageId);
      return isScriptStartedEvent && isSameContentScript && isNotDuplicate;
    }
    listenForNewerScripts(options) {
      let isFirst = true;
      const cb = (event) => {
        if (this.verifyScriptStartedEvent(event)) {
          this.receivedMessageIds.add(event.data.messageId);
          const wasFirst = isFirst;
          isFirst = false;
          if (wasFirst && (options == null ? void 0 : options.ignoreFirstEvent)) return;
          this.notifyInvalidated();
        }
      };
      addEventListener("message", cb);
      this.onInvalidated(() => removeEventListener("message", cb));
    }
  };
  __publicField(_ContentScriptContext, "SCRIPT_STARTED_MESSAGE_TYPE", getUniqueEventName(
    "wxt:content-script-started"
  ));
  let ContentScriptContext = _ContentScriptContext;
  function initPlugins() {
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
  const result = (async () => {
    try {
      initPlugins();
      const { main, ...options } = definition;
      const ctx = new ContentScriptContext("bsky_alt_generator", options);
      return await main(ctx);
    } catch (err) {
      logger.error(
        `The content script "${"bsky_alt_generator"}" crashed on startup!`,
        err
      );
      throw err;
    }
  })();
  return result;
}();
bskyaltgenerator;
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYnNreV9hbHRfZ2VuZXJhdG9yLmpzIiwic291cmNlcyI6WyIuLi8uLi8uLi9ub2RlX21vZHVsZXMvd3h0L2Rpc3QvdXRpbHMvZGVmaW5lLWNvbnRlbnQtc2NyaXB0Lm1qcyIsIi4uLy4uLy4uL2VudHJ5cG9pbnRzL2Jza3lfYWx0X2dlbmVyYXRvci5jb250ZW50LnRzIiwiLi4vLi4vLi4vbm9kZV9tb2R1bGVzL0B3eHQtZGV2L2Jyb3dzZXIvc3JjL2luZGV4Lm1qcyIsIi4uLy4uLy4uL25vZGVfbW9kdWxlcy93eHQvZGlzdC9icm93c2VyLm1qcyIsIi4uLy4uLy4uL25vZGVfbW9kdWxlcy93eHQvZGlzdC91dGlscy9pbnRlcm5hbC9sb2dnZXIubWpzIiwiLi4vLi4vLi4vbm9kZV9tb2R1bGVzL3d4dC9kaXN0L3V0aWxzL2ludGVybmFsL2N1c3RvbS1ldmVudHMubWpzIiwiLi4vLi4vLi4vbm9kZV9tb2R1bGVzL3d4dC9kaXN0L3V0aWxzL2ludGVybmFsL2xvY2F0aW9uLXdhdGNoZXIubWpzIiwiLi4vLi4vLi4vbm9kZV9tb2R1bGVzL3d4dC9kaXN0L3V0aWxzL2NvbnRlbnQtc2NyaXB0LWNvbnRleHQubWpzIl0sInNvdXJjZXNDb250ZW50IjpbImV4cG9ydCBmdW5jdGlvbiBkZWZpbmVDb250ZW50U2NyaXB0KGRlZmluaXRpb24pIHtcbiAgcmV0dXJuIGRlZmluaXRpb247XG59XG4iLCJleHBvcnQgZGVmYXVsdCBkZWZpbmVDb250ZW50U2NyaXB0KHtcbiAgbWF0Y2hlczogWycqOi8vKi5ic2t5LmFwcC8qJ10sXG4gIG1haW4oKSB7XG4gICAgY29uc29sZS5sb2coJ0JsdWVza3kgQWx0IFRleHQgR2VuZXJhdG9yIGxvYWRlZCcpO1xuICAgIFxuICAgIC8vIE9ubHkgcnVuIGluIGJyb3dzZXIgKG5vdCBkdXJpbmcgYnVpbGQvc3NyKVxuICAgIGlmICh0eXBlb2Ygd2luZG93ID09PSAndW5kZWZpbmVkJyB8fCB0eXBlb2YgZG9jdW1lbnQgPT09ICd1bmRlZmluZWQnKSB7XG4gICAgICByZXR1cm47XG4gICAgfVxuICAgIFxuICAgIC8vIENvbnN0YW50c1xuICAgIGNvbnN0IEFMVF9URVhUX1NFTEVDVE9SID0gJ3RleHRhcmVhW2FyaWEtbGFiZWw9XCJBbHQgdGV4dFwiXSc7XG4gICAgY29uc3QgQlVUVE9OX0lEID0gJ2dlbWluaS1hbHQtdGV4dC1idXR0b24nO1xuICAgIFxuICAgIC8vIEFkZCB0aGUgYnV0dG9uIHRvIGFuIGFsdCB0ZXh0IHRleHRhcmVhXG4gICAgZnVuY3Rpb24gYWRkR2VuZXJhdGVCdXR0b24odGV4dGFyZWE6IEhUTUxUZXh0QXJlYUVsZW1lbnQpIHtcbiAgICAgIGNvbnNvbGUubG9nKCdhZGRHZW5lcmF0ZUJ1dHRvbiBjYWxsZWQgZm9yIHRleHRhcmVhOicsIHRleHRhcmVhKTsgLy8gTG9nIGZ1bmN0aW9uIHN0YXJ0IGFuZCB0YXJnZXRcblxuICAgICAgLy8gUHJldmVudCBhZGRpbmcgbXVsdGlwbGUgYnV0dG9uc1xuICAgICAgaWYgKHRleHRhcmVhLmRhdGFzZXQuZ2VtaW5pQnV0dG9uQWRkZWQgPT09ICd0cnVlJykge1xuICAgICAgICBjb25zb2xlLmxvZygnQnV0dG9uIGFscmVhZHkgYWRkZWQgdG8gdGhpcyB0ZXh0YXJlYSwgc2tpcHBpbmcuJyk7XG4gICAgICAgIHJldHVybjtcbiAgICAgIH1cblxuICAgICAgLy8gRmluZCB0aGUgcGFyZW50IGVsZW1lbnQgdGhhdCBsaWtlbHkgY29udGFpbnMgdGhlIHBvc3QgYnV0dG9uLCBldGMuXG4gICAgICAvLyBBZGp1c3QgdGhlIG51bWJlciBvZiBwYXJlbnRFbGVtZW50IGNhbGxzIGlmIHRoZSBzdHJ1Y3R1cmUgY2hhbmdlcy5cbiAgICAgIC8vIExldCdzIHVzZSBhIG1vcmUgcm9idXN0IHdheSwgc2VhcmNoaW5nIHVwd2FyZHMgZm9yIGEgY29udGFpbmVyIHdpdGggc3BlY2lmaWMgY2hhcmFjdGVyaXN0aWNzXG4gICAgICAvLyBUaGlzIGlzIGEgcGxhY2Vob2xkZXIgLSBuZWVkcyBpbnNwZWN0aW9uIGlmIGJ1dHRvbiBwbGFjZW1lbnQgaXMgd3JvbmdcbiAgICAgIGxldCBjb250YWluZXIgPSB0ZXh0YXJlYS5jbG9zZXN0KCdkaXZbZGF0YS10ZXN0aWQ9XCJjb21wb3NlclwiXScpOyAvLyBFeGFtcGxlOiBMb29rIGZvciBhIGNvbW1vbiBjb21wb3NlciBjb250YWluZXIgdGVzdCBJRFxuICAgICAgaWYgKCFjb250YWluZXIpIHtcbiAgICAgICAgICAvLyBGYWxsYmFjayBpZiB0aGUgdGVzdCBJRCBpc24ndCBmb3VuZCBvciBjaGFuZ2VzXG4gICAgICAgICAgY29udGFpbmVyID0gdGV4dGFyZWEucGFyZW50RWxlbWVudD8ucGFyZW50RWxlbWVudD8ucGFyZW50RWxlbWVudDsgXG4gICAgICAgICAgY29uc29sZS5sb2coJ1VzaW5nIGZhbGxiYWNrIGNvbnRhaW5lcjonLCBjb250YWluZXIpO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgICBjb25zb2xlLmxvZygnRm91bmQgY29udGFpbmVyIHZpYSBjbG9zZXN0KCk6JywgY29udGFpbmVyKTtcbiAgICAgIH1cblxuXG4gICAgICBpZiAoIWNvbnRhaW5lcikge1xuICAgICAgICBjb25zb2xlLmVycm9yKCdDb3VsZCBub3QgZmluZCBhIHN1aXRhYmxlIGNvbnRhaW5lciBmb3IgdGhlIGJ1dHRvbiBuZWFyIHRleHRhcmVhOicsIHRleHRhcmVhKTtcbiAgICAgICAgcmV0dXJuO1xuICAgICAgfVxuICAgICAgXG4gICAgICAvLyBDaGVjayBpZiBidXR0b24gYWxyZWFkeSBleGlzdHMgd2l0aGluIHRoaXMgc3BlY2lmaWMgY29udGFpbmVyIGluc3RhbmNlIChsZXNzIGxpa2VseSBuZWVkZWQgd2l0aCB0aGUgZGF0YXNldCBjaGVjaywgYnV0IHNhZmUpXG4gICAgICBpZiAoY29udGFpbmVyLnF1ZXJ5U2VsZWN0b3IoYCMke0JVVFRPTl9JRH1gKSkge1xuICAgICAgICBjb25zb2xlLmxvZygnQnV0dG9uIGFscmVhZHkgZXhpc3RzIGluIHRoaXMgY29udGFpbmVyLCBza2lwcGluZy4nKTtcbiAgICAgICAgcmV0dXJuO1xuICAgICAgfVxuXG5cbiAgICAgIC8vIENyZWF0ZSB0aGUgYnV0dG9uXG4gICAgICBjb25zdCBidXR0b24gPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdidXR0b24nKTtcbiAgICAgIGJ1dHRvbi5pZCA9IEJVVFRPTl9JRDtcbiAgICAgIGJ1dHRvbi50ZXh0Q29udGVudCA9ICdHZW4gQWx0IFRleHQnO1xuICAgICAgYnV0dG9uLnN0eWxlLm1hcmdpbkxlZnQgPSAnOHB4JzsgLy8gQWRkIHNvbWUgc3BhY2luZ1xuICAgICAgYnV0dG9uLnN0eWxlLnBhZGRpbmcgPSAnMnB4IDhweCc7XG4gICAgICBidXR0b24uc3R5bGUuZm9udFNpemUgPSAnMC45ZW0nO1xuICAgICAgYnV0dG9uLnN0eWxlLmN1cnNvciA9ICdwb2ludGVyJztcbiAgICAgIGJ1dHRvbi5zdHlsZS5ib3JkZXIgPSAnMXB4IHNvbGlkICNjY2MnO1xuICAgICAgYnV0dG9uLnN0eWxlLmJvcmRlclJhZGl1cyA9ICc0cHgnO1xuICAgICAgYnV0dG9uLnN0eWxlLmJhY2tncm91bmRDb2xvciA9ICcjZjBmMGYwJztcbiAgICAgIGNvbnNvbGUubG9nKCdCdXR0b24gZWxlbWVudCBjcmVhdGVkOicsIGJ1dHRvbik7IC8vIExvZyB0aGUgY3JlYXRlZCBidXR0b25cblxuXG4gICAgICAvLyBCdXR0b24gY2xpY2sgaGFuZGxlclxuICAgICAgYnV0dG9uLm9uY2xpY2sgPSBhc3luYyAoZSkgPT4ge1xuICAgICAgICBlLnByZXZlbnREZWZhdWx0KCk7IC8vIFByZXZlbnQgcG90ZW50aWFsIGZvcm0gc3VibWlzc2lvbiBvciBvdGhlciBkZWZhdWx0IGFjdGlvbnNcbiAgICAgICAgZS5zdG9wUHJvcGFnYXRpb24oKTsgLy8gU3RvcCB0aGUgY2xpY2sgZnJvbSBwcm9wYWdhdGluZyBmdXJ0aGVyXG5cbiAgICAgICAgY29uc29sZS5sb2coJ0dlbmVyYXRlIEFsdCBUZXh0IGJ1dHRvbiBjbGlja2VkJyk7XG4gICAgICAgIGJ1dHRvbi50ZXh0Q29udGVudCA9ICdHZW5lcmF0aW5nLi4uJztcbiAgICAgICAgYnV0dG9uLmRpc2FibGVkID0gdHJ1ZTtcblxuICAgICAgICAvLyBGaW5kIHRoZSBpbWFnZSBhc3NvY2lhdGVkIHdpdGggdGhpcyBhbHQgdGV4dCBib3hcbiAgICAgICAgLy8gVGhpcyBsb2dpYyBtaWdodCBuZWVkIGFkanVzdG1lbnQgYmFzZWQgb24gdGhlIGFjdHVhbCBET00gc3RydWN0dXJlXG4gICAgICAgIGNvbnN0IGltYWdlRWxlbWVudCA9IGNvbnRhaW5lcj8ucXVlcnlTZWxlY3RvcignaW1nW2FsdD1cIkltYWdlIHByZXZpZXdcIl0sIGltZ1tkcmFnZ2FibGU9XCJ0cnVlXCJdJyk7IC8vIExvb2sgZm9yIGFuIGltYWdlIHByZXZpZXcgd2l0aGluIHRoZSBjb250YWluZXJcblxuICAgICAgICBpZiAoIWltYWdlRWxlbWVudCkge1xuICAgICAgICAgIGNvbnNvbGUuZXJyb3IoJ0NvdWxkIG5vdCBmaW5kIHRoZSBpbWFnZSBlbGVtZW50IG5lYXIgdGhlIGJ1dHRvbi4nKTtcbiAgICAgICAgICBidXR0b24udGV4dENvbnRlbnQgPSAnRXJyb3I6IE5vIEltYWdlJztcbiAgICAgICAgICBzZXRUaW1lb3V0KCgpID0+IHtcbiAgICAgICAgICAgICBidXR0b24udGV4dENvbnRlbnQgPSAnR2VuIEFsdCBUZXh0JzsgXG4gICAgICAgICAgICAgYnV0dG9uLmRpc2FibGVkID0gZmFsc2U7XG4gICAgICAgICAgICB9LCAyMDAwKTtcbiAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cblxuICAgICAgICBjb25zb2xlLmxvZygnRm91bmQgaW1hZ2UgZWxlbWVudDonLCBpbWFnZUVsZW1lbnQpO1xuICAgICAgICBjb25zdCBpbWFnZVVybCA9IGltYWdlRWxlbWVudC5zcmM7XG5cbiAgICAgICAgaWYgKCFpbWFnZVVybCkge1xuICAgICAgICAgICBjb25zb2xlLmVycm9yKCdJbWFnZSBlbGVtZW50IGZvdW5kLCBidXQgc3JjIGF0dHJpYnV0ZSBpcyBtaXNzaW5nIG9yIGVtcHR5LicpO1xuICAgICAgICAgICBidXR0b24udGV4dENvbnRlbnQgPSAnRXJyb3I6IE5vIFVSTCc7XG4gICAgICAgICAgIHNldFRpbWVvdXQoKCkgPT4ge1xuICAgICAgICAgICAgIGJ1dHRvbi50ZXh0Q29udGVudCA9ICdHZW4gQWx0IFRleHQnOyBcbiAgICAgICAgICAgICBidXR0b24uZGlzYWJsZWQgPSBmYWxzZTtcbiAgICAgICAgICAgIH0sIDIwMDApO1xuICAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cbiAgICAgICAgXG4gICAgICAgIGNvbnNvbGUubG9nKCdJbWFnZSBVUkw6JywgaW1hZ2VVcmwpO1xuXG5cbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICAvLyBTZW5kIG1lc3NhZ2UgdG8gYmFja2dyb3VuZCBzY3JpcHRcbiAgICAgICAgICBjb25zdCByZXNwb25zZSA9IGF3YWl0IGNocm9tZS5ydW50aW1lLnNlbmRNZXNzYWdlKHtcbiAgICAgICAgICAgIGFjdGlvbjogJ2dlbmVyYXRlQWx0VGV4dCcsXG4gICAgICAgICAgICBpbWFnZURhdGE6IHsgdXJsOiBpbWFnZVVybCB9IC8vIFNlbmRpbmcgVVJMIGZvciBub3dcbiAgICAgICAgICB9KTtcblxuICAgICAgICAgIGNvbnNvbGUubG9nKCdSZWNlaXZlZCByZXNwb25zZSBmcm9tIGJhY2tncm91bmQgc2NyaXB0OicsIHJlc3BvbnNlKTtcblxuICAgICAgICAgIGlmIChyZXNwb25zZS5hbHRUZXh0KSB7XG4gICAgICAgICAgICB0ZXh0YXJlYS52YWx1ZSA9IHJlc3BvbnNlLmFsdFRleHQ7XG4gICAgICAgICAgICAvLyBEaXNwYXRjaCBpbnB1dCBldmVudCB0byBlbnN1cmUgZnJhbWV3b3JrcyBkZXRlY3QgdGhlIGNoYW5nZVxuICAgICAgICAgICAgdGV4dGFyZWEuZGlzcGF0Y2hFdmVudChuZXcgRXZlbnQoJ2lucHV0JywgeyBidWJibGVzOiB0cnVlLCBjYW5jZWxhYmxlOiB0cnVlIH0pKTtcbiAgICAgICAgICAgIGNvbnNvbGUubG9nKCdBbHQgdGV4dCBpbnNlcnRlZC4nKTtcbiAgICAgICAgICAgIGJ1dHRvbi50ZXh0Q29udGVudCA9ICfinJMgRG9uZSc7XG4gICAgICAgICAgICAgc2V0VGltZW91dCgoKSA9PiB7XG4gICAgICAgICAgICAgICBidXR0b24udGV4dENvbnRlbnQgPSAnR2VuIEFsdCBUZXh0JzsgXG4gICAgICAgICAgICAgICBidXR0b24uZGlzYWJsZWQgPSBmYWxzZTtcbiAgICAgICAgICAgICAgfSwgMTUwMCk7XG4gICAgICAgICAgfSBlbHNlIGlmIChyZXNwb25zZS5lcnJvcikge1xuICAgICAgICAgICAgY29uc29sZS5lcnJvcignRXJyb3IgZ2VuZXJhdGluZyBhbHQgdGV4dDonLCByZXNwb25zZS5lcnJvcik7XG4gICAgICAgICAgICBidXR0b24udGV4dENvbnRlbnQgPSBgRXJyb3I6ICR7cmVzcG9uc2UuZXJyb3Iuc3Vic3RyaW5nKDAsMjApfS4uLmA7XG4gICAgICAgICAgICAgc2V0VGltZW91dCgoKSA9PiB7XG4gICAgICAgICAgICAgICBidXR0b24udGV4dENvbnRlbnQgPSAnR2VuIEFsdCBUZXh0JzsgXG4gICAgICAgICAgICAgICBidXR0b24uZGlzYWJsZWQgPSBmYWxzZTtcbiAgICAgICAgICAgICAgfSwgMzAwMCk7XG4gICAgICAgICAgfVxuICAgICAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgICAgIGNvbnNvbGUuZXJyb3IoJ0Vycm9yIHNlbmRpbmcgbWVzc2FnZSB0byBiYWNrZ3JvdW5kIHNjcmlwdCBvciBwcm9jZXNzaW5nIHJlc3BvbnNlOicsIGVycm9yKTtcbiAgICAgICAgICBidXR0b24udGV4dENvbnRlbnQgPSAnRXJyb3InO1xuICAgICAgICAgICBzZXRUaW1lb3V0KCgpID0+IHtcbiAgICAgICAgICAgICAgIGJ1dHRvbi50ZXh0Q29udGVudCA9ICdHZW4gQWx0IFRleHQnOyBcbiAgICAgICAgICAgICAgIGJ1dHRvbi5kaXNhYmxlZCA9IGZhbHNlO1xuICAgICAgICAgICAgICB9LCAyMDAwKTtcbiAgICAgICAgfSBmaW5hbGx5IHtcbiAgICAgICAgICAvLyBSZS1lbmFibGUgYnV0dG9uIGFmdGVyIGEgZGVsYXksIGhhbmRsZWQgd2l0aGluIHRyeS9jYXRjaCBub3dcbiAgICAgICAgfVxuICAgICAgfTtcblxuICAgICAgLy8gQXBwZW5kIHRoZSBidXR0b24gLSBUcnkgYXBwZW5kaW5nIG5leHQgdG8gdGhlIHRleHRhcmVhIGZpcnN0XG4gICAgICBjb25zb2xlLmxvZygnQXR0ZW1wdGluZyB0byBpbnNlcnQgYnV0dG9uIG5leHQgdG8gdGV4dGFyZWE6JywgdGV4dGFyZWEpO1xuICAgICAgdGV4dGFyZWEucGFyZW50Tm9kZT8uaW5zZXJ0QmVmb3JlKGJ1dHRvbiwgdGV4dGFyZWEubmV4dFNpYmxpbmcpO1xuICAgICAgXG4gICAgICAvLyBNYXJrIHRoZSB0ZXh0YXJlYSBzbyB3ZSBkb24ndCBhZGQgdGhlIGJ1dHRvbiBhZ2FpblxuICAgICAgdGV4dGFyZWEuZGF0YXNldC5nZW1pbmlCdXR0b25BZGRlZCA9ICd0cnVlJzsgXG4gICAgICBcbiAgICAgIGNvbnNvbGUubG9nKCdCdXR0b24gaW5zZXJ0aW9uIGF0dGVtcHRlZC4gQ2hlY2sgdGhlIERPTS4nKTsgLy8gTG9nIGFmdGVyIGF0dGVtcHRpbmcgaW5zZXJ0aW9uXG5cbiAgICB9XG4gICAgXG4gICAgLy8gSGVscGVyIHRvIGZpbmQgdGhlIGNvbXBvc2VyIGNvbnRhaW5lciBmcm9tIGEgdGV4dGFyZWFcbiAgICBmdW5jdGlvbiBmaW5kQ29tcG9zZXJDb250YWluZXIoZWxlbWVudCkge1xuICAgICAgLy8gV2FsayB1cCB0aGUgRE9NIHRvIGZpbmQgdGhlIGNvbXBvc2VyIGNvbnRhaW5lclxuICAgICAgLy8gVGhpcyBtaWdodCBuZWVkIGFkanVzdG1lbnQgYmFzZWQgb24gQmx1ZXNreSdzIERPTSBzdHJ1Y3R1cmVcbiAgICAgIGxldCBjdXJyZW50ID0gZWxlbWVudDtcbiAgICAgIC8vIExvb2sgZm9yIGEgY29udGFpbmVyIHRoYXQgaGFzIHRoZSBpbWFnZSBwcmV2aWV3XG4gICAgICB3aGlsZSAoY3VycmVudCAmJiBjdXJyZW50LnRhZ05hbWUgIT09ICdCT0RZJykge1xuICAgICAgICAvLyBUcnkgdG8gZmluZCBhbiBpbWcgaW5zaWRlIHRoaXMgY29udGFpbmVyXG4gICAgICAgIGNvbnN0IGltZ1ByZXZpZXcgPSBjdXJyZW50LnF1ZXJ5U2VsZWN0b3IoJ2ltZ1thbHQ9XCJJbWFnZSBwcmV2aWV3XCJdJyk7XG4gICAgICAgIGlmIChpbWdQcmV2aWV3KSB7XG4gICAgICAgICAgcmV0dXJuIGN1cnJlbnQ7XG4gICAgICAgIH1cbiAgICAgICAgY3VycmVudCA9IGN1cnJlbnQucGFyZW50RWxlbWVudDtcbiAgICAgIH1cbiAgICAgIHJldHVybiBudWxsO1xuICAgIH1cbiAgICBcbiAgICAvLyBQcm9jZXNzIGV4aXN0aW5nIHRleHRhcmVhc1xuICAgIGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3JBbGwoQUxUX1RFWFRfU0VMRUNUT1IpLmZvckVhY2godGV4dGFyZWEgPT4ge1xuICAgICAgYWRkR2VuZXJhdGVCdXR0b24odGV4dGFyZWEgYXMgSFRNTFRleHRBcmVhRWxlbWVudCk7XG4gICAgfSk7XG4gICAgXG4gICAgLy8gV2F0Y2ggZm9yIGR5bmFtaWNhbGx5IGFkZGVkIHRleHRhcmVhc1xuICAgIGNvbnN0IG9ic2VydmVyID0gbmV3IE11dGF0aW9uT2JzZXJ2ZXIobXV0YXRpb25zID0+IHtcbiAgICAgIGNvbnNvbGUubG9nKCdNdXRhdGlvbk9ic2VydmVyIGNhbGxiYWNrIHRyaWdnZXJlZC4nKTsgLy8gTG9nIG9ic2VydmVyIGFjdGl2aXR5XG4gICAgICBmb3IgKGNvbnN0IG11dGF0aW9uIG9mIG11dGF0aW9ucykge1xuICAgICAgICBpZiAobXV0YXRpb24udHlwZSA9PT0gJ2NoaWxkTGlzdCcpIHtcbiAgICAgICAgICBtdXRhdGlvbi5hZGRlZE5vZGVzLmZvckVhY2gobm9kZSA9PiB7XG4gICAgICAgICAgICAvLyBDaGVjayBpZiB0aGUgYWRkZWQgbm9kZSBpcyBhbiBlbGVtZW50XG4gICAgICAgICAgICBpZiAobm9kZS5ub2RlVHlwZSA9PT0gTm9kZS5FTEVNRU5UX05PREUpIHtcbiAgICAgICAgICAgICAgY29uc3QgZWxlbWVudCA9IG5vZGUgYXMgRWxlbWVudDsgLy8gVHlwZSBhc3NlcnRpb25cbiAgICAgICAgICAgICAgLy8gQ2hlY2sgaWYgaXQncyB0aGUgdGV4dGFyZWEgaXRzZWxmXG4gICAgICAgICAgICAgIGlmIChlbGVtZW50Lm1hdGNoZXMgJiYgZWxlbWVudC5tYXRjaGVzKEFMVF9URVhUX1NFTEVDVE9SKSkge1xuICAgICAgICAgICAgICAgICBjb25zb2xlLmxvZygnT2JzZXJ2ZXIgZm91bmQgbWF0Y2hpbmcgdGV4dGFyZWEgZGlyZWN0bHk6JywgZWxlbWVudCk7XG4gICAgICAgICAgICAgICAgIGFkZEdlbmVyYXRlQnV0dG9uKGVsZW1lbnQgYXMgSFRNTFRleHRBcmVhRWxlbWVudCk7XG4gICAgICAgICAgICAgIH0gXG4gICAgICAgICAgICAgIC8vIENoZWNrIGlmIGl0IGNvbnRhaW5zIGFueSBtYXRjaGluZyB0ZXh0YXJlYXNcbiAgICAgICAgICAgICAgZWxzZSBpZiAoZWxlbWVudC5xdWVyeVNlbGVjdG9yQWxsKSB7XG4gICAgICAgICAgICAgICAgZWxlbWVudC5xdWVyeVNlbGVjdG9yQWxsKEFMVF9URVhUX1NFTEVDVE9SKS5mb3JFYWNoKHRleHRhcmVhID0+IHtcbiAgICAgICAgICAgICAgICAgICBjb25zb2xlLmxvZygnT2JzZXJ2ZXIgZm91bmQgbWF0Y2hpbmcgdGV4dGFyZWEgd2l0aGluIGFkZGVkIG5vZGU6JywgdGV4dGFyZWEpO1xuICAgICAgICAgICAgICAgICAgIGFkZEdlbmVyYXRlQnV0dG9uKHRleHRhcmVhIGFzIEhUTUxUZXh0QXJlYUVsZW1lbnQpO1xuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgICAgfSk7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9KTtcbiAgICBcbiAgICAvLyBTdGFydCBvYnNlcnZpbmdcbiAgICBvYnNlcnZlci5vYnNlcnZlKGRvY3VtZW50LmJvZHksIHsgXG4gICAgICBjaGlsZExpc3Q6IHRydWUsIFxuICAgICAgc3VidHJlZTogdHJ1ZSBcbiAgICB9KTtcbiAgICBcbiAgICBjb25zb2xlLmxvZygnQWx0IHRleHQgZ2VuZXJhdG9yIGluaXRpYWxpemVkIGFuZCB3YXRjaGluZyBmb3IgdGV4dGFyZWFzJyk7XG4gIH1cbn0pOyIsIi8vICNyZWdpb24gc25pcHBldFxuZXhwb3J0IGNvbnN0IGJyb3dzZXIgPSBnbG9iYWxUaGlzLmJyb3dzZXI/LnJ1bnRpbWU/LmlkXG4gID8gZ2xvYmFsVGhpcy5icm93c2VyXG4gIDogZ2xvYmFsVGhpcy5jaHJvbWU7XG4vLyAjZW5kcmVnaW9uIHNuaXBwZXRcbiIsImltcG9ydCB7IGJyb3dzZXIgYXMgX2Jyb3dzZXIgfSBmcm9tIFwiQHd4dC1kZXYvYnJvd3NlclwiO1xuZXhwb3J0IGNvbnN0IGJyb3dzZXIgPSBfYnJvd3NlcjtcbmV4cG9ydCB7fTtcbiIsImZ1bmN0aW9uIHByaW50KG1ldGhvZCwgLi4uYXJncykge1xuICBpZiAoaW1wb3J0Lm1ldGEuZW52Lk1PREUgPT09IFwicHJvZHVjdGlvblwiKSByZXR1cm47XG4gIGlmICh0eXBlb2YgYXJnc1swXSA9PT0gXCJzdHJpbmdcIikge1xuICAgIGNvbnN0IG1lc3NhZ2UgPSBhcmdzLnNoaWZ0KCk7XG4gICAgbWV0aG9kKGBbd3h0XSAke21lc3NhZ2V9YCwgLi4uYXJncyk7XG4gIH0gZWxzZSB7XG4gICAgbWV0aG9kKFwiW3d4dF1cIiwgLi4uYXJncyk7XG4gIH1cbn1cbmV4cG9ydCBjb25zdCBsb2dnZXIgPSB7XG4gIGRlYnVnOiAoLi4uYXJncykgPT4gcHJpbnQoY29uc29sZS5kZWJ1ZywgLi4uYXJncyksXG4gIGxvZzogKC4uLmFyZ3MpID0+IHByaW50KGNvbnNvbGUubG9nLCAuLi5hcmdzKSxcbiAgd2FybjogKC4uLmFyZ3MpID0+IHByaW50KGNvbnNvbGUud2FybiwgLi4uYXJncyksXG4gIGVycm9yOiAoLi4uYXJncykgPT4gcHJpbnQoY29uc29sZS5lcnJvciwgLi4uYXJncylcbn07XG4iLCJpbXBvcnQgeyBicm93c2VyIH0gZnJvbSBcInd4dC9icm93c2VyXCI7XG5leHBvcnQgY2xhc3MgV3h0TG9jYXRpb25DaGFuZ2VFdmVudCBleHRlbmRzIEV2ZW50IHtcbiAgY29uc3RydWN0b3IobmV3VXJsLCBvbGRVcmwpIHtcbiAgICBzdXBlcihXeHRMb2NhdGlvbkNoYW5nZUV2ZW50LkVWRU5UX05BTUUsIHt9KTtcbiAgICB0aGlzLm5ld1VybCA9IG5ld1VybDtcbiAgICB0aGlzLm9sZFVybCA9IG9sZFVybDtcbiAgfVxuICBzdGF0aWMgRVZFTlRfTkFNRSA9IGdldFVuaXF1ZUV2ZW50TmFtZShcInd4dDpsb2NhdGlvbmNoYW5nZVwiKTtcbn1cbmV4cG9ydCBmdW5jdGlvbiBnZXRVbmlxdWVFdmVudE5hbWUoZXZlbnROYW1lKSB7XG4gIHJldHVybiBgJHticm93c2VyPy5ydW50aW1lPy5pZH06JHtpbXBvcnQubWV0YS5lbnYuRU5UUllQT0lOVH06JHtldmVudE5hbWV9YDtcbn1cbiIsImltcG9ydCB7IFd4dExvY2F0aW9uQ2hhbmdlRXZlbnQgfSBmcm9tIFwiLi9jdXN0b20tZXZlbnRzLm1qc1wiO1xuZXhwb3J0IGZ1bmN0aW9uIGNyZWF0ZUxvY2F0aW9uV2F0Y2hlcihjdHgpIHtcbiAgbGV0IGludGVydmFsO1xuICBsZXQgb2xkVXJsO1xuICByZXR1cm4ge1xuICAgIC8qKlxuICAgICAqIEVuc3VyZSB0aGUgbG9jYXRpb24gd2F0Y2hlciBpcyBhY3RpdmVseSBsb29raW5nIGZvciBVUkwgY2hhbmdlcy4gSWYgaXQncyBhbHJlYWR5IHdhdGNoaW5nLFxuICAgICAqIHRoaXMgaXMgYSBub29wLlxuICAgICAqL1xuICAgIHJ1bigpIHtcbiAgICAgIGlmIChpbnRlcnZhbCAhPSBudWxsKSByZXR1cm47XG4gICAgICBvbGRVcmwgPSBuZXcgVVJMKGxvY2F0aW9uLmhyZWYpO1xuICAgICAgaW50ZXJ2YWwgPSBjdHguc2V0SW50ZXJ2YWwoKCkgPT4ge1xuICAgICAgICBsZXQgbmV3VXJsID0gbmV3IFVSTChsb2NhdGlvbi5ocmVmKTtcbiAgICAgICAgaWYgKG5ld1VybC5ocmVmICE9PSBvbGRVcmwuaHJlZikge1xuICAgICAgICAgIHdpbmRvdy5kaXNwYXRjaEV2ZW50KG5ldyBXeHRMb2NhdGlvbkNoYW5nZUV2ZW50KG5ld1VybCwgb2xkVXJsKSk7XG4gICAgICAgICAgb2xkVXJsID0gbmV3VXJsO1xuICAgICAgICB9XG4gICAgICB9LCAxZTMpO1xuICAgIH1cbiAgfTtcbn1cbiIsImltcG9ydCB7IGJyb3dzZXIgfSBmcm9tIFwid3h0L2Jyb3dzZXJcIjtcbmltcG9ydCB7IGxvZ2dlciB9IGZyb20gXCIuLi91dGlscy9pbnRlcm5hbC9sb2dnZXIubWpzXCI7XG5pbXBvcnQge1xuICBnZXRVbmlxdWVFdmVudE5hbWVcbn0gZnJvbSBcIi4vaW50ZXJuYWwvY3VzdG9tLWV2ZW50cy5tanNcIjtcbmltcG9ydCB7IGNyZWF0ZUxvY2F0aW9uV2F0Y2hlciB9IGZyb20gXCIuL2ludGVybmFsL2xvY2F0aW9uLXdhdGNoZXIubWpzXCI7XG5leHBvcnQgY2xhc3MgQ29udGVudFNjcmlwdENvbnRleHQge1xuICBjb25zdHJ1Y3Rvcihjb250ZW50U2NyaXB0TmFtZSwgb3B0aW9ucykge1xuICAgIHRoaXMuY29udGVudFNjcmlwdE5hbWUgPSBjb250ZW50U2NyaXB0TmFtZTtcbiAgICB0aGlzLm9wdGlvbnMgPSBvcHRpb25zO1xuICAgIHRoaXMuYWJvcnRDb250cm9sbGVyID0gbmV3IEFib3J0Q29udHJvbGxlcigpO1xuICAgIGlmICh0aGlzLmlzVG9wRnJhbWUpIHtcbiAgICAgIHRoaXMubGlzdGVuRm9yTmV3ZXJTY3JpcHRzKHsgaWdub3JlRmlyc3RFdmVudDogdHJ1ZSB9KTtcbiAgICAgIHRoaXMuc3RvcE9sZFNjcmlwdHMoKTtcbiAgICB9IGVsc2Uge1xuICAgICAgdGhpcy5saXN0ZW5Gb3JOZXdlclNjcmlwdHMoKTtcbiAgICB9XG4gIH1cbiAgc3RhdGljIFNDUklQVF9TVEFSVEVEX01FU1NBR0VfVFlQRSA9IGdldFVuaXF1ZUV2ZW50TmFtZShcbiAgICBcInd4dDpjb250ZW50LXNjcmlwdC1zdGFydGVkXCJcbiAgKTtcbiAgaXNUb3BGcmFtZSA9IHdpbmRvdy5zZWxmID09PSB3aW5kb3cudG9wO1xuICBhYm9ydENvbnRyb2xsZXI7XG4gIGxvY2F0aW9uV2F0Y2hlciA9IGNyZWF0ZUxvY2F0aW9uV2F0Y2hlcih0aGlzKTtcbiAgcmVjZWl2ZWRNZXNzYWdlSWRzID0gLyogQF9fUFVSRV9fICovIG5ldyBTZXQoKTtcbiAgZ2V0IHNpZ25hbCgpIHtcbiAgICByZXR1cm4gdGhpcy5hYm9ydENvbnRyb2xsZXIuc2lnbmFsO1xuICB9XG4gIGFib3J0KHJlYXNvbikge1xuICAgIHJldHVybiB0aGlzLmFib3J0Q29udHJvbGxlci5hYm9ydChyZWFzb24pO1xuICB9XG4gIGdldCBpc0ludmFsaWQoKSB7XG4gICAgaWYgKGJyb3dzZXIucnVudGltZS5pZCA9PSBudWxsKSB7XG4gICAgICB0aGlzLm5vdGlmeUludmFsaWRhdGVkKCk7XG4gICAgfVxuICAgIHJldHVybiB0aGlzLnNpZ25hbC5hYm9ydGVkO1xuICB9XG4gIGdldCBpc1ZhbGlkKCkge1xuICAgIHJldHVybiAhdGhpcy5pc0ludmFsaWQ7XG4gIH1cbiAgLyoqXG4gICAqIEFkZCBhIGxpc3RlbmVyIHRoYXQgaXMgY2FsbGVkIHdoZW4gdGhlIGNvbnRlbnQgc2NyaXB0J3MgY29udGV4dCBpcyBpbnZhbGlkYXRlZC5cbiAgICpcbiAgICogQHJldHVybnMgQSBmdW5jdGlvbiB0byByZW1vdmUgdGhlIGxpc3RlbmVyLlxuICAgKlxuICAgKiBAZXhhbXBsZVxuICAgKiBicm93c2VyLnJ1bnRpbWUub25NZXNzYWdlLmFkZExpc3RlbmVyKGNiKTtcbiAgICogY29uc3QgcmVtb3ZlSW52YWxpZGF0ZWRMaXN0ZW5lciA9IGN0eC5vbkludmFsaWRhdGVkKCgpID0+IHtcbiAgICogICBicm93c2VyLnJ1bnRpbWUub25NZXNzYWdlLnJlbW92ZUxpc3RlbmVyKGNiKTtcbiAgICogfSlcbiAgICogLy8gLi4uXG4gICAqIHJlbW92ZUludmFsaWRhdGVkTGlzdGVuZXIoKTtcbiAgICovXG4gIG9uSW52YWxpZGF0ZWQoY2IpIHtcbiAgICB0aGlzLnNpZ25hbC5hZGRFdmVudExpc3RlbmVyKFwiYWJvcnRcIiwgY2IpO1xuICAgIHJldHVybiAoKSA9PiB0aGlzLnNpZ25hbC5yZW1vdmVFdmVudExpc3RlbmVyKFwiYWJvcnRcIiwgY2IpO1xuICB9XG4gIC8qKlxuICAgKiBSZXR1cm4gYSBwcm9taXNlIHRoYXQgbmV2ZXIgcmVzb2x2ZXMuIFVzZWZ1bCBpZiB5b3UgaGF2ZSBhbiBhc3luYyBmdW5jdGlvbiB0aGF0IHNob3VsZG4ndCBydW5cbiAgICogYWZ0ZXIgdGhlIGNvbnRleHQgaXMgZXhwaXJlZC5cbiAgICpcbiAgICogQGV4YW1wbGVcbiAgICogY29uc3QgZ2V0VmFsdWVGcm9tU3RvcmFnZSA9IGFzeW5jICgpID0+IHtcbiAgICogICBpZiAoY3R4LmlzSW52YWxpZCkgcmV0dXJuIGN0eC5ibG9jaygpO1xuICAgKlxuICAgKiAgIC8vIC4uLlxuICAgKiB9XG4gICAqL1xuICBibG9jaygpIHtcbiAgICByZXR1cm4gbmV3IFByb21pc2UoKCkgPT4ge1xuICAgIH0pO1xuICB9XG4gIC8qKlxuICAgKiBXcmFwcGVyIGFyb3VuZCBgd2luZG93LnNldEludGVydmFsYCB0aGF0IGF1dG9tYXRpY2FsbHkgY2xlYXJzIHRoZSBpbnRlcnZhbCB3aGVuIGludmFsaWRhdGVkLlxuICAgKi9cbiAgc2V0SW50ZXJ2YWwoaGFuZGxlciwgdGltZW91dCkge1xuICAgIGNvbnN0IGlkID0gc2V0SW50ZXJ2YWwoKCkgPT4ge1xuICAgICAgaWYgKHRoaXMuaXNWYWxpZCkgaGFuZGxlcigpO1xuICAgIH0sIHRpbWVvdXQpO1xuICAgIHRoaXMub25JbnZhbGlkYXRlZCgoKSA9PiBjbGVhckludGVydmFsKGlkKSk7XG4gICAgcmV0dXJuIGlkO1xuICB9XG4gIC8qKlxuICAgKiBXcmFwcGVyIGFyb3VuZCBgd2luZG93LnNldFRpbWVvdXRgIHRoYXQgYXV0b21hdGljYWxseSBjbGVhcnMgdGhlIGludGVydmFsIHdoZW4gaW52YWxpZGF0ZWQuXG4gICAqL1xuICBzZXRUaW1lb3V0KGhhbmRsZXIsIHRpbWVvdXQpIHtcbiAgICBjb25zdCBpZCA9IHNldFRpbWVvdXQoKCkgPT4ge1xuICAgICAgaWYgKHRoaXMuaXNWYWxpZCkgaGFuZGxlcigpO1xuICAgIH0sIHRpbWVvdXQpO1xuICAgIHRoaXMub25JbnZhbGlkYXRlZCgoKSA9PiBjbGVhclRpbWVvdXQoaWQpKTtcbiAgICByZXR1cm4gaWQ7XG4gIH1cbiAgLyoqXG4gICAqIFdyYXBwZXIgYXJvdW5kIGB3aW5kb3cucmVxdWVzdEFuaW1hdGlvbkZyYW1lYCB0aGF0IGF1dG9tYXRpY2FsbHkgY2FuY2VscyB0aGUgcmVxdWVzdCB3aGVuXG4gICAqIGludmFsaWRhdGVkLlxuICAgKi9cbiAgcmVxdWVzdEFuaW1hdGlvbkZyYW1lKGNhbGxiYWNrKSB7XG4gICAgY29uc3QgaWQgPSByZXF1ZXN0QW5pbWF0aW9uRnJhbWUoKC4uLmFyZ3MpID0+IHtcbiAgICAgIGlmICh0aGlzLmlzVmFsaWQpIGNhbGxiYWNrKC4uLmFyZ3MpO1xuICAgIH0pO1xuICAgIHRoaXMub25JbnZhbGlkYXRlZCgoKSA9PiBjYW5jZWxBbmltYXRpb25GcmFtZShpZCkpO1xuICAgIHJldHVybiBpZDtcbiAgfVxuICAvKipcbiAgICogV3JhcHBlciBhcm91bmQgYHdpbmRvdy5yZXF1ZXN0SWRsZUNhbGxiYWNrYCB0aGF0IGF1dG9tYXRpY2FsbHkgY2FuY2VscyB0aGUgcmVxdWVzdCB3aGVuXG4gICAqIGludmFsaWRhdGVkLlxuICAgKi9cbiAgcmVxdWVzdElkbGVDYWxsYmFjayhjYWxsYmFjaywgb3B0aW9ucykge1xuICAgIGNvbnN0IGlkID0gcmVxdWVzdElkbGVDYWxsYmFjaygoLi4uYXJncykgPT4ge1xuICAgICAgaWYgKCF0aGlzLnNpZ25hbC5hYm9ydGVkKSBjYWxsYmFjayguLi5hcmdzKTtcbiAgICB9LCBvcHRpb25zKTtcbiAgICB0aGlzLm9uSW52YWxpZGF0ZWQoKCkgPT4gY2FuY2VsSWRsZUNhbGxiYWNrKGlkKSk7XG4gICAgcmV0dXJuIGlkO1xuICB9XG4gIGFkZEV2ZW50TGlzdGVuZXIodGFyZ2V0LCB0eXBlLCBoYW5kbGVyLCBvcHRpb25zKSB7XG4gICAgaWYgKHR5cGUgPT09IFwid3h0OmxvY2F0aW9uY2hhbmdlXCIpIHtcbiAgICAgIGlmICh0aGlzLmlzVmFsaWQpIHRoaXMubG9jYXRpb25XYXRjaGVyLnJ1bigpO1xuICAgIH1cbiAgICB0YXJnZXQuYWRkRXZlbnRMaXN0ZW5lcj8uKFxuICAgICAgdHlwZS5zdGFydHNXaXRoKFwid3h0OlwiKSA/IGdldFVuaXF1ZUV2ZW50TmFtZSh0eXBlKSA6IHR5cGUsXG4gICAgICBoYW5kbGVyLFxuICAgICAge1xuICAgICAgICAuLi5vcHRpb25zLFxuICAgICAgICBzaWduYWw6IHRoaXMuc2lnbmFsXG4gICAgICB9XG4gICAgKTtcbiAgfVxuICAvKipcbiAgICogQGludGVybmFsXG4gICAqIEFib3J0IHRoZSBhYm9ydCBjb250cm9sbGVyIGFuZCBleGVjdXRlIGFsbCBgb25JbnZhbGlkYXRlZGAgbGlzdGVuZXJzLlxuICAgKi9cbiAgbm90aWZ5SW52YWxpZGF0ZWQoKSB7XG4gICAgdGhpcy5hYm9ydChcIkNvbnRlbnQgc2NyaXB0IGNvbnRleHQgaW52YWxpZGF0ZWRcIik7XG4gICAgbG9nZ2VyLmRlYnVnKFxuICAgICAgYENvbnRlbnQgc2NyaXB0IFwiJHt0aGlzLmNvbnRlbnRTY3JpcHROYW1lfVwiIGNvbnRleHQgaW52YWxpZGF0ZWRgXG4gICAgKTtcbiAgfVxuICBzdG9wT2xkU2NyaXB0cygpIHtcbiAgICB3aW5kb3cucG9zdE1lc3NhZ2UoXG4gICAgICB7XG4gICAgICAgIHR5cGU6IENvbnRlbnRTY3JpcHRDb250ZXh0LlNDUklQVF9TVEFSVEVEX01FU1NBR0VfVFlQRSxcbiAgICAgICAgY29udGVudFNjcmlwdE5hbWU6IHRoaXMuY29udGVudFNjcmlwdE5hbWUsXG4gICAgICAgIG1lc3NhZ2VJZDogTWF0aC5yYW5kb20oKS50b1N0cmluZygzNikuc2xpY2UoMilcbiAgICAgIH0sXG4gICAgICBcIipcIlxuICAgICk7XG4gIH1cbiAgdmVyaWZ5U2NyaXB0U3RhcnRlZEV2ZW50KGV2ZW50KSB7XG4gICAgY29uc3QgaXNTY3JpcHRTdGFydGVkRXZlbnQgPSBldmVudC5kYXRhPy50eXBlID09PSBDb250ZW50U2NyaXB0Q29udGV4dC5TQ1JJUFRfU1RBUlRFRF9NRVNTQUdFX1RZUEU7XG4gICAgY29uc3QgaXNTYW1lQ29udGVudFNjcmlwdCA9IGV2ZW50LmRhdGE/LmNvbnRlbnRTY3JpcHROYW1lID09PSB0aGlzLmNvbnRlbnRTY3JpcHROYW1lO1xuICAgIGNvbnN0IGlzTm90RHVwbGljYXRlID0gIXRoaXMucmVjZWl2ZWRNZXNzYWdlSWRzLmhhcyhldmVudC5kYXRhPy5tZXNzYWdlSWQpO1xuICAgIHJldHVybiBpc1NjcmlwdFN0YXJ0ZWRFdmVudCAmJiBpc1NhbWVDb250ZW50U2NyaXB0ICYmIGlzTm90RHVwbGljYXRlO1xuICB9XG4gIGxpc3RlbkZvck5ld2VyU2NyaXB0cyhvcHRpb25zKSB7XG4gICAgbGV0IGlzRmlyc3QgPSB0cnVlO1xuICAgIGNvbnN0IGNiID0gKGV2ZW50KSA9PiB7XG4gICAgICBpZiAodGhpcy52ZXJpZnlTY3JpcHRTdGFydGVkRXZlbnQoZXZlbnQpKSB7XG4gICAgICAgIHRoaXMucmVjZWl2ZWRNZXNzYWdlSWRzLmFkZChldmVudC5kYXRhLm1lc3NhZ2VJZCk7XG4gICAgICAgIGNvbnN0IHdhc0ZpcnN0ID0gaXNGaXJzdDtcbiAgICAgICAgaXNGaXJzdCA9IGZhbHNlO1xuICAgICAgICBpZiAod2FzRmlyc3QgJiYgb3B0aW9ucz8uaWdub3JlRmlyc3RFdmVudCkgcmV0dXJuO1xuICAgICAgICB0aGlzLm5vdGlmeUludmFsaWRhdGVkKCk7XG4gICAgICB9XG4gICAgfTtcbiAgICBhZGRFdmVudExpc3RlbmVyKFwibWVzc2FnZVwiLCBjYik7XG4gICAgdGhpcy5vbkludmFsaWRhdGVkKCgpID0+IHJlbW92ZUV2ZW50TGlzdGVuZXIoXCJtZXNzYWdlXCIsIGNiKSk7XG4gIH1cbn1cbiJdLCJuYW1lcyI6WyJkZWZpbml0aW9uIiwiX2IiLCJfYSIsImJyb3dzZXIiLCJfYnJvd3NlciIsInByaW50IiwibG9nZ2VyIl0sIm1hcHBpbmdzIjoiOzs7Ozs7QUFBTyxXQUFTLG9CQUFvQkEsYUFBWTtBQUM5QyxXQUFPQTtBQUFBLEVBQ1Q7QUNGQSxRQUFBLGFBQUEsb0JBQUE7QUFBQSxJQUFtQyxTQUFBLENBQUEsa0JBQUE7QUFBQSxJQUNMLE9BQUE7QUFFMUIsY0FBQSxJQUFBLG1DQUFBO0FBR0EsVUFBQSxPQUFBLFdBQUEsZUFBQSxPQUFBLGFBQUEsYUFBQTtBQUNFO0FBQUEsTUFBQTtBQUlGLFlBQUEsb0JBQUE7QUFDQSxZQUFBLFlBQUE7QUFHQSxlQUFBLGtCQUFBLFVBQUE7O0FBQ0UsZ0JBQUEsSUFBQSwwQ0FBQSxRQUFBO0FBR0EsWUFBQSxTQUFBLFFBQUEsc0JBQUEsUUFBQTtBQUNFLGtCQUFBLElBQUEsa0RBQUE7QUFDQTtBQUFBLFFBQUE7QUFPRixZQUFBLFlBQUEsU0FBQSxRQUFBLDZCQUFBO0FBQ0EsWUFBQSxDQUFBLFdBQUE7QUFFSSx1QkFBQUMsT0FBQUMsTUFBQSxTQUFBLGtCQUFBLGdCQUFBQSxJQUFBLGtCQUFBLGdCQUFBRCxJQUFBO0FBQ0Esa0JBQUEsSUFBQSw2QkFBQSxTQUFBO0FBQUEsUUFBa0QsT0FBQTtBQUVsRCxrQkFBQSxJQUFBLGtDQUFBLFNBQUE7QUFBQSxRQUF1RDtBQUkzRCxZQUFBLENBQUEsV0FBQTtBQUNFLGtCQUFBLE1BQUEscUVBQUEsUUFBQTtBQUNBO0FBQUEsUUFBQTtBQUlGLFlB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
