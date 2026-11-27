// Runs the served add-in script in a fake Office runtime and checks that the
// signature from the API is inserted. Usage: SING365_URL=http://localhost:3100 node test/commands.sim.mjs
import vm from "node:vm";
import assert from "node:assert/strict";

const base = process.env.SING365_URL ?? "http://localhost:3000";
const code = await (await fetch(`${base}/addin/commands.js`)).text();

async function run({ from, composeType, to }) {
  const handlers = {};
  let inserted = null, disabled = false, completed = false;
  const ok = (value) => (cb) => cb({ status: "succeeded", value });
  const item = {
    from: { getAsync: ok({ emailAddress: from }) },
    getComposeTypeAsync: ok({ composeType }),
    to: { getAsync: ok(to.map((e) => ({ emailAddress: e }))) },
    cc: { getAsync: ok([]) },
    bcc: { getAsync: ok([]) },
    disableClientSignatureAsync: (cb) => { disabled = true; cb({ status: "succeeded" }); },
    body: { setSignatureAsync: (html, opts, cb) => { inserted = html; cb({ status: "succeeded" }); } },
  };
  const Office = {
    onReady() {},
    CoercionType: { Html: "html" },
    actions: { associate: (n, f) => (handlers[n] = f) },
    context: { mailbox: { item, userProfile: { emailAddress: from } } },
  };
  vm.runInNewContext(code, { Office, fetch, encodeURIComponent, Promise });
  await new Promise((resolve) => handlers.onNewMessageComposeHandler({ completed: () => { completed = true; resolve(); } }));
  return { inserted, disabled, completed };
}

const sales = await run({ from: "ayse.yilmaz@example.com", composeType: "newMail", to: ["client@other.com"] });
assert.ok(sales.completed && sales.disabled, "event completed and client signature disabled");
assert.match(sales.inserted, /Yeni depo hizmetimizle/, "sales campaign signature for external new mail");

const reply = await run({ from: "ayse.yilmaz@example.com", composeType: "reply", to: ["client@other.com"] });
assert.doesNotMatch(reply.inserted, /Yeni depo/, "short reply signature");
assert.match(reply.inserted, /Ayşe Yılmaz \| Kurumsal Satış Müdürü/);

const unknown = await run({ from: "stranger@nowhere.com", composeType: "newMail", to: [] });
assert.equal(unknown.inserted, null, "nothing inserted for unknown senders");
assert.ok(unknown.completed, "event still completes");

console.log("add-in simulation: 3 scenarios passed");
