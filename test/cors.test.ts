import { cors, OriginFn } from "../mod.ts";
import { assertEquals, createInject, Denzo } from "./deps.ts";

const { test } = Deno;

const toObj = (headers: Headers) => Object.fromEntries(headers);

function assertMatch(
  obj: Record<string, unknown>,
  expected: Record<string, unknown>,
) {
  for (const key in expected) {
    assertEquals(obj[key], expected[key]);
  }
}

test("Should add cors headers  ", async () => {
  const denzo = new Denzo();
  denzo.register(cors, { allowParentHooks: true });

  denzo.route({
    method: "GET",
    url: "/",
    handler: (req, reply) => {
      reply.send("ok");
    },
  });

  denzo.finalize();
  const inject = createInject(denzo);
  const response = await inject("/", {
    method: "GET",
  });

  assertEquals(response.status, 200);
  const body = await response.text();
  assertEquals(body, "ok");
  assertMatch(toObj(response.headers), {
    "access-control-allow-origin": "*",
  });
});

test("Should add cors headers (custom values) ", async () => {
  const denzo = new Denzo();
  denzo.register(cors, { allowParentHooks: true }, {
    origin: "example.com",
    methods: ["GET"],
    credentials: true,
    exposedHeaders: ["foo", "bar"],
    allowedHeaders: ["baz", "woo"],
    maxAge: 123,
  });

  denzo.route({
    method: "GET",
    url: "/",
    handler: (req, reply) => {
      reply.send("ok");
    },
  });

  denzo.finalize();
  const inject = createInject(denzo);
  let response = await inject("/", {
    method: "OPTIONS",
    headers: {
      "access-control-request-method": "GET",
      origin: "example.com",
    },
  });

  response.headers.delete("date");
  assertEquals(response.status, 204);
  let body = await response.text();
  assertEquals(body, "");
  assertMatch(toObj(response.headers), {
    "access-control-allow-origin": "example.com",
    vary: "Origin",
    "access-control-allow-credentials": "true",
    "access-control-expose-headers": "foo, bar",
    "access-control-allow-methods": "GET",
    "access-control-allow-headers": "baz, woo",
    "access-control-max-age": "123",
    // "content-length": "0",
  });

  response = await inject("/", {
    method: "GET",
  });

  response.headers.delete("date");
  assertEquals(response.status, 200);
  body = await response.text();
  assertEquals(body, "ok");
  assertMatch(toObj(response.headers), {
    "access-control-allow-origin": "example.com",
    vary: "Origin",
    "access-control-allow-credentials": "true",
    "access-control-expose-headers": "foo, bar",
    // "content-length": "2", // Todo core
  });
});

test("Dynamic origin resolution (valid origin) ", async () => {
  const denzo = new Denzo();
  const origin: OriginFn = (origin) => {
    assertEquals(origin, "example.com");
    return true;
  };

  denzo.register(cors, { allowParentHooks: true }, { origin });

  denzo.route({
    method: "GET",
    url: "/",
    handler: (req, reply) => {
      reply.send("ok");
    },
  });

  denzo.finalize();
  const inject = createInject(denzo);
  const response = await inject("/", {
    method: "GET",
    headers: { origin: "example.com" },
  });

  response.headers.delete("date");
  assertEquals(response.status, 200);
  const body = await response.text();
  assertEquals(body, "ok");
  assertMatch(toObj(response.headers), {
    "access-control-allow-origin": "example.com",
    vary: "Origin",
  });
});

test("Dynamic origin resolution (not valid origin) ", async () => {
  const denzo = new Denzo();
  const origin: OriginFn = (origin) => {
    assertEquals(origin, "example.com");
    return false;
  };

  denzo.register(cors, { allowParentHooks: true }, { origin });

  denzo.route({
    method: "GET",
    url: "/",
    handler: (req, reply) => {
      reply.send("ok");
    },
  });

  denzo.finalize();
  const inject = createInject(denzo);
  const response = await inject("/", {
    method: "GET",
    headers: { origin: "example.com" },
  });

  response.headers.delete("date");
  assertEquals(response.status, 200);
  const body = await response.text();
  assertEquals(body, "ok");
  assertMatch(toObj(response.headers), {
    // "content-length": "2", // Todo core
    vary: "Origin",
  });
});

test("Dynamic origin resolution (errored) ", async () => {
  const denzo = new Denzo();
  const origin: OriginFn = (origin) => {
    assertEquals(origin, "example.com");
    throw new Error("oh");
  };

  denzo.register(cors, { allowParentHooks: true }, { origin });

  denzo.finalize();
  const inject = createInject(denzo);
  const response = await inject("/", {
    method: "GET",
    headers: { origin: "example.com" },
  });

  assertEquals(response.status, 500);
});

test("Should reply 404 without cors headers other than `vary` when origin is false ", async () => {
  const denzo = new Denzo();
  denzo.register(cors, { allowParentHooks: true }, {
    origin: false,
    methods: ["GET"],
    credentials: true,
    exposedHeaders: ["foo", "bar"],
    allowedHeaders: ["baz", "woo"],
    maxAge: 123,
  });

  denzo.route({
    method: "GET",
    url: "/",
    handler: (req, reply) => {
      reply.send("ok");
    },
  });

  denzo.finalize();
  const inject = createInject(denzo);
  let response = await inject("/", {
    method: "OPTIONS",
  });

  response.headers.delete("date");
  assertEquals(response.status, 404);

  assertMatch(toObj(response.headers), {
    // "content-length": "76",
    vary: "Origin",
  });

  response = await inject("/", {
    method: "GET",
  });

  response.headers.delete("date");
  assertEquals(response.status, 200);
  assertEquals(await response.text(), "ok");
  assertMatch(toObj(response.headers), {
    // "content-length": "2", // Todo core
    vary: "Origin",
  });
});

test("Server error if origin option is falsy but not false ", async () => {
  const denzo = new Denzo();
  denzo.register(cors, { allowParentHooks: true }, { origin: "" });

  denzo.finalize();
  const inject = createInject(denzo);
  const response = await inject("/", {
    method: "GET",
    headers: { origin: "example.com" },
  });

  response.headers.delete("date");
  assertEquals(response.status, 500);
  assertEquals(await response.json(), {
    errorCode: "INTERNAL_SERVER_ERROR",
    message: "Invalid CORS origin option",
  });
  assertMatch(toObj(response.headers), {
    // "content-length": "89",
    vary: "Origin",
  });
});

test("Allow only request from a specific origin ", async () => {
  const denzo = new Denzo();
  denzo.register(cors, { allowParentHooks: true }, { origin: "other.io" });

  denzo.route({
    method: "GET",
    url: "/",
    handler: (req, reply) => {
      reply.send("ok");
    },
  });

  denzo.finalize();
  const inject = createInject(denzo);
  const response = await inject("/", {
    method: "GET",
    headers: { origin: "example.com" },
  });

  response.headers.delete("date");
  assertEquals(response.status, 200);
  const body = await response.text();
  assertEquals(body, "ok");
  assertMatch(toObj(response.headers), {
    "access-control-allow-origin": "other.io",
    vary: "Origin",
  });
});

test("Allow only request from multiple specific origin ", async () => {
  const denzo = new Denzo();
  denzo.register(cors, { allowParentHooks: true }, {
    origin: ["other.io", "example.com"],
  });

  denzo.route({
    method: "GET",
    url: "/",
    handler: (req, reply) => {
      reply.send("ok");
    },
  });

  denzo.finalize();
  const inject = createInject(denzo);
  let response = await inject("/", {
    method: "GET",
    headers: { origin: "other.io" },
  });

  response.headers.delete("date");
  assertEquals(response.status, 200);
  let body = await response.text();
  assertEquals(body, "ok");
  assertMatch(toObj(response.headers), {
    "access-control-allow-origin": "other.io",
    vary: "Origin",
  });

  response = await inject("/", {
    method: "GET",
    headers: { origin: "foo.com" },
  });

  response.headers.delete("date");
  assertEquals(response.status, 200);
  body = await response.text();
  assertEquals(body, "ok");
  assertMatch(toObj(response.headers), {
    vary: "Origin",
  });
  assertEquals(response.headers.get("access-control-allow-origin"), null);
});

test("Allow only request from a specific origin using regex ", async () => {
  const denzo = new Denzo();
  denzo.register(cors, { allowParentHooks: true }, {
    origin: /^(example|other)\.com/,
  });

  denzo.route({
    method: "GET",
    url: "/",
    handler: (req, reply) => {
      reply.send("ok");
    },
  });

  denzo.finalize();
  const inject = createInject(denzo);
  const response = await inject("/", {
    method: "GET",
    headers: { origin: "example.com" },
  });

  response.headers.delete("date");
  assertEquals(response.status, 200);
  const body = await response.text();
  assertEquals(body, "ok");
  assertMatch(toObj(response.headers), {
    "access-control-allow-origin": "example.com",
    vary: "Origin",
  });
});

test("Disable preflight ", async () => {
  const denzo = new Denzo();
  denzo.register(cors, { allowParentHooks: true }, { preflight: false });

  denzo.route({
    method: "GET",
    url: "/",
    handler: (req, reply) => {
      reply.send("ok");
    },
  });

  denzo.finalize();
  const inject = createInject(denzo);
  let response = await inject("/hello", {
    method: "OPTIONS",
  });

  response.headers.delete("date");
  assertEquals(response.status, 404);
  assertMatch(toObj(response.headers), {
    "access-control-allow-origin": "*",
  });

  response = await inject("/", {
    method: "GET",
  });

  response.headers.delete("date");
  assertEquals(response.status, 200);
  const body = await response.text();
  assertEquals(body, "ok");
  assertMatch(toObj(response.headers), {
    "access-control-allow-origin": "*",
  });
});

test("Should always add vary header to `Origin` by default ", async () => {
  const denzo = new Denzo();
  denzo.register(cors, { allowParentHooks: true });

  denzo.route({
    method: "GET",
    url: "/",
    handler: (req, reply) => {
      reply.send("ok");
    },
  });

  // Invalid Preflight
  denzo.finalize();
  const inject = createInject(denzo);
  let response = await inject("/", {
    method: "OPTIONS",
  });

  response.headers.delete("date");
  assertEquals(response.status, 400);
  let body = await response.text();
  assertEquals(body, "Invalid Preflight Request");
  assertMatch(toObj(response.headers), {
    vary: "Origin",
  });

  // Valid Preflight
  response = await inject("/", {
    method: "OPTIONS",
    headers: {
      "access-control-request-method": "GET",
      origin: "example.com",
    },
  });

  response.headers.delete("date");
  assertEquals(response.status, 204);
  body = await response.text();
  assertEquals(body, "");
  assertMatch(toObj(response.headers), {
    vary: "Origin, Access-Control-Request-Headers", // todo
  });

  // Other Route
  response = await inject("/", {
    method: "GET",
  });

  response.headers.delete("date");
  assertEquals(response.status, 200);
  body = await response.text();
  assertEquals(body, "ok");
  assertMatch(toObj(response.headers), {
    vary: "Origin",
  });
});

// test("Should always add vary header to `Origin` by default (vary is array) ", async () => {
//   const denzo = new Denzo();

//   // Mock getHeader function
//   denzo.decorateReply("getHeader", (name) => ["foo", "bar"]);

//   denzo.register(cors, { allowParentHooks: true });

//   denzo.route({
//     method: "GET",
//     url: "/",
//     handler: (req, reply) => {
//       reply.send("ok");
//     },
//   });

//   denzo.finalize();
//   const inject = createInject(denzo);
//   const response = await inject("/", {
//     method: "GET",
//   });

//   response.headers.delete("date");
//   assertEquals(response.status, 200);
//   const body = await response.text();
//   assertEquals(body, "ok");
//   assertMatch(toObj(response.headers), {
//     vary: "foo, bar, Origin",
//   });
// });

test("Allow only request from with specific headers ", async () => {
  const denzo = new Denzo();
  denzo.register(cors, { allowParentHooks: true }, {
    allowedHeaders: "foo",
    exposedHeaders: "bar",
  });

  denzo.route({
    method: "GET",
    url: "/",
    handler: (req, reply) => {
      reply.send("ok");
    },
  });

  denzo.finalize();
  const inject = createInject(denzo);
  let response = await inject("/", {
    method: "OPTIONS",
    headers: {
      "access-control-request-method": "GET",
      origin: "example.com",
    },
  });

  response.headers.delete("date");
  assertEquals(response.status, 204);
  assertMatch(toObj(response.headers), {
    "access-control-allow-headers": "foo",
    vary: "Origin",
  });

  response = await inject("/", {
    method: "GET",
  });

  response.headers.delete("date");
  assertEquals(response.status, 200);
  const body = await response.text();
  assertEquals(body, "ok");
  assertMatch(toObj(response.headers), {
    "access-control-expose-headers": "bar",
  });
});
