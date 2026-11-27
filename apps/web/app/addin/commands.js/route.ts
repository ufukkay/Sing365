/**
 * Event-based activation script for the Outlook add-in.
 * Served as a route so the API origin is baked in: classic Outlook on Windows
 * runs this file in a JavaScript-only runtime without a page location.
 */
export const dynamic = "force-dynamic";

const script = (apiBase: string) => `/* Sing365 Outlook add-in: inserts the assigned signature on compose. */
var SING365_API = ${JSON.stringify(apiBase)};

function sing365Get(fn) {
  return new Promise(function (resolve) {
    try { fn(function (r) { resolve(r && r.status === "succeeded" ? r.value : null); }); }
    catch (e) { resolve(null); }
  });
}

function sing365Recipients(item) {
  var lists = [item.to, item.cc, item.bcc].filter(Boolean);
  return Promise.all(lists.map(function (l) { return sing365Get(function (cb) { l.getAsync(cb); }); }))
    .then(function (rs) {
      var out = [];
      rs.forEach(function (r) { (r || []).forEach(function (x) { if (x && x.emailAddress) out.push(x.emailAddress); }); });
      return out;
    });
}

function sing365Insert(event) {
  var item = Office.context.mailbox.item;
  var done = function () { try { event.completed(); } catch (e) {} };
  var fromP = item.from && item.from.getAsync
    ? sing365Get(function (cb) { item.from.getAsync(cb); }).then(function (f) { return f && f.emailAddress; })
    : Promise.resolve(null);
  var typeP = item.getComposeTypeAsync
    ? sing365Get(function (cb) { item.getComposeTypeAsync(cb); }).then(function (t) { return t && t.composeType; })
    : Promise.resolve("newMail");

  Promise.all([fromP, typeP, sing365Recipients(item)])
    .then(function (v) {
      var from = v[0] || Office.context.mailbox.userProfile.emailAddress;
      var mode = v[1] === "reply" || v[1] === "forward" ? "reply" : "new";
      var url = SING365_API + "/api/addin/signature?mode=" + mode +
        "&from=" + encodeURIComponent(from) + "&to=" + encodeURIComponent(v[2].join(","));
      // TODO(replica-backend): attach the Nested App Authentication access token.
      return fetch(url, { credentials: "omit" });
    })
    .then(function (res) { return res.ok ? res.json() : null; })
    .then(function (sig) {
      if (!sig || !sig.html) { done(); return; }
      if (item.disableClientSignatureAsync) item.disableClientSignatureAsync(function () {});
      item.body.setSignatureAsync(sig.html, { coercionType: Office.CoercionType.Html }, done);
    })
    .catch(done);
}

function onNewMessageComposeHandler(event) { sing365Insert(event); }
function onMessageRecipientsChangedHandler(event) { sing365Insert(event); }
function onMessageFromChangedHandler(event) { sing365Insert(event); }

Office.onReady(function () {});
if (Office.actions && Office.actions.associate) {
  Office.actions.associate("onNewMessageComposeHandler", onNewMessageComposeHandler);
  Office.actions.associate("onMessageRecipientsChangedHandler", onMessageRecipientsChangedHandler);
  Office.actions.associate("onMessageFromChangedHandler", onMessageFromChangedHandler);
}
`;

export function GET(req: Request) {
  const base = process.env.SING365_PUBLIC_URL ?? new URL(req.url).origin;
  return new Response(script(base.replace(/\/$/, "")), {
    headers: { "Content-Type": "application/javascript; charset=utf-8", "Cache-Control": "no-cache" },
  });
}
