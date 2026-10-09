import { randomBytes } from "node:crypto";
import { spawn } from "node:child_process";
import { createServer } from "node:http";

export const DEFAULT_APP_URL = "https://app.rumoro.dev";

export class LoginError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LoginError";
  }
}

/** The one-time code the dashboard hands back with the key (24 random bytes, URL-safe). */
export const newState = () => randomBytes(24).toString("base64url");

export function loginUrl(appUrl: string, params: { port: number; state: string; name: string; scope: string }) {
  const url = new URL("/cli/authorize", `${appUrl.replace(/\/+$/, "")}/`);
  url.searchParams.set("port", String(params.port));
  url.searchParams.set("state", params.state);
  url.searchParams.set("name", params.name);
  url.searchParams.set("scope", params.scope);
  return url.toString();
}

const page = (title: string, body: string) =>
  `<!doctype html><meta charset="utf-8"><title>${title}</title><body style="font:16px system-ui;padding:3rem;max-width:36rem;margin:auto"><h1 style="font-size:1.25rem">${title}</h1><p>${body}</p></body>`;

/**
 * A server on 127.0.0.1 that waits for the dashboard's redirect to /callback with this state and a key. Only this
 * computer can reach it; a callback with another state is refused and the wait goes on.
 */
export function startCallbackServer(state: string, timeoutMs: number): Promise<{ port: number; key: Promise<string>; close: () => void }> {
  return new Promise((resolveServer, rejectServer) => {
    let settle: { resolve: (key: string) => void; reject: (error: Error) => void } | null = null;
    const key = new Promise<string>((resolve, reject) => { settle = { resolve, reject }; });
    const server = createServer((request, response) => {
      const url = new URL(request.url ?? "/", "http://127.0.0.1");
      const html = (status: number, title: string, body: string) => response.writeHead(status, { "content-type": "text/html; charset=utf-8" }).end(page(title, body));
      if (url.pathname !== "/callback") return html(404, "Not found", "Nothing here.");
      const error = url.searchParams.get("error");
      if (error) {
        html(200, "Cancelled", "The CLI was not authorized. You can close this tab.");
        return finish(() => settle?.reject(new LoginError(error === "denied" ? "Authorization was declined in the browser." : `Authorization failed: ${error}`)));
      }
      if (url.searchParams.get("state") !== state) return html(400, "State mismatch", "This callback does not belong to the running login. Run rumoro auth:login again.");
      const issued = url.searchParams.get("key");
      if (!issued) return html(400, "Missing key", "The callback carried no key. Run rumoro auth:login again.");
      html(200, "Rumoro CLI connected", "The key is stored on this computer. You can close this tab and go back to the terminal.");
      finish(() => settle?.resolve(issued));
    });
    const timer = setTimeout(() => finish(() => settle?.reject(new LoginError(`No authorization arrived within ${Math.round(timeoutMs / 1000)} seconds.`))), timeoutMs);
    const close = () => {
      clearTimeout(timer);
      server.close();
    };
    // Let the browser receive its page before the server closes.
    const finish = (outcome: () => void) => { setTimeout(() => { outcome(); close(); }, 50); };
    server.on("error", (error) => rejectServer(error));
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") return rejectServer(new LoginError("Could not open a loopback port."));
      key.catch(() => {});
      resolveServer({ port: address.port, key, close });
    });
  });
}

export function openBrowser(url: string) {
  try {
    const [command, args] = process.platform === "darwin" ? ["open", [url]] : process.platform === "win32" ? ["cmd", ["/c", "start", "", url]] : ["xdg-open", [url]];
    const child = spawn(command as string, args as string[], { detached: true, stdio: "ignore" });
    child.on("error", () => {});
    child.unref();
    return true;
  } catch {
    return false;
  }
}
