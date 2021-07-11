import { Denzo } from "denzo/mod.ts";
import { cors } from "./mod.ts";

const app = new Denzo();

app.register(cors, { allowParentHooks: true });

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
