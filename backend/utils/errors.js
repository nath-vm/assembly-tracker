// Central helper so internal error details (stack traces, DB messages) are
// logged on the server but never sent to the client.
function sendServerError(res, err, context = "") {
  console.error(context ? `[${context}]` : "[error]", err);
  if (res.headersSent) return;
  res.status(500).json({ error: "Internal server error" });
}

module.exports = { sendServerError };
