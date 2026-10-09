import type { Operation } from "./types";

// Verbs the path cannot give: activities, the team's invitations, the wallet, the JSON export.
const NAMED_VERBS: Record<string, string> = {
  listPersonActivities: "activities",
  logPersonActivity: "log-activity",
  deletePersonActivity: "delete-activity",
  listInvitations: "invitations",
  createInvitation: "invite",
  revokeInvitation: "revoke-invitation",
  removeMember: "remove",
  createTopUp: "top-up",
  getInvoiceUrl: "invoice-url",
  exportMentionsJson: "export-json",
};
const SINGLETONS = new Set(["company", "filters", "usage"]);

/** An operation's command: the path's first segment as the noun, the verb from the method and the rest of the path. */
export function commandName(op: Pick<Operation, "operationId" | "method" | "path">) {
  const segments = op.path.replace(/^\/v1\//, "").split("/");
  const noun = segments[0] ?? "";
  if (noun === "health") return "system:health";
  if (noun === "whoami") return "auth:whoami";
  const named = NAMED_VERBS[op.operationId];
  if (named !== undefined) return `${noun}:${named}`;
  const rest = segments.slice(1);
  const hasId = rest.some((segment) => segment.startsWith("{"));
  const action = rest.find((segment) => !segment.startsWith("{"));
  const method = op.method.toLowerCase();
  let verb: string;
  if (action !== undefined) verb = action === "export.csv" ? "export" : action;
  else if (method === "get" && !hasId) verb = op.operationId.startsWith("search") ? "search" : SINGLETONS.has(noun) ? "get" : "list";
  else if (method === "post" && !hasId) verb = "create";
  else if (method === "get") verb = "get";
  else if (method === "patch") verb = "update";
  else if (method === "delete") verb = op.operationId.startsWith("revoke") ? "revoke" : "delete";
  else verb = method;
  return `${noun}:${verb}`;
}
