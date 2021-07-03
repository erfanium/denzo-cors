import { Denzo } from "https://raw.githubusercontent.com/irandeno/denzo/fab2803/mod.ts";
import { cors } from "./mod.ts";

const app = new Denzo();

app.addHook("onRequest", (request) => {
  console.log(request.method, request.url.pathname);
});

app.register(cors, { allowRootHooks: true });

app.route({
  method: "GET",
  url: "/hi",
  handler() {
    return { hello: "world" };
  },
});

app.route({
  method: "POST",
  url: "/echo",
  handler(request) {
    return request.body;
  },
});

const listener = Deno.listen({ port: 3000 });
app.serve(listener);
console.log("http://localhost:3000");
