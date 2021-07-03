import {
  createKey,
  createPlugin,
  DenzoReply,
  DenzoRequest,
  Vary,
} from "./deps.ts";

export type OriginOption = string | string[] | RegExp | boolean;
export type OriginFn = (
  origin: string | null,
) => OriginOption | Promise<OriginOption>;

export interface CorsConfig {
  origin: OriginOption | OriginFn;
  methods: string[];
  preflightContinue: boolean;
  optionsSuccessStatus: number;
  credentials: boolean;
  exposedHeaders?: string | string[];
  allowedHeaders?: string | string[];
  maxAge?: number;
  preflight: boolean;
  strictPreflight: boolean;
}

const defaultConfig: CorsConfig = {
  origin: "*",
  methods: ["GET", "HEAD", "PUT", "PATCH", "POST", "DELETE"],
  preflightContinue: false,
  optionsSuccessStatus: 204,
  credentials: false,
  preflight: true,
  strictPreflight: true,
};

export const corsPreflightEnabledKey = createKey<boolean>(
  "corsPreflightEnabled",
);

export const cors = createPlugin(
  "denzo-cors",
  (denzo, _config: Partial<CorsConfig>) => {
    const config = Object.assign({}, defaultConfig, _config);

    denzo.addHook("onRequest", (req, reply) => onRequest(config, req, reply), {
      scope: "root",
    });

    denzo.route({
      method: "OPTIONS",
      url: "/*", // todo core
      handler(request, reply) {
        if (!request.find(corsPreflightEnabledKey)) {
          return reply.status(404).send();
        }
      },
    });
  },
);

function resolveOriginWrapper(origin: OriginFn) {
  return function (request: DenzoRequest) {
    return origin(request.headers.get("origin"));
  };
}

function vary(reply: DenzoReply, field: string) {
  let value = reply.headers.get("Vary") || "";
  value = Vary.append(value, field);
  if (value) {
    reply.header("Vary", value);
  }
}

function addCorsHeaders(
  req: DenzoRequest,
  reply: DenzoReply,
  originOption: OriginOption,
  config: CorsConfig,
) {
  const origin = getAccessControlAllowOriginHeader(
    req.headers.get("origin")!,
    originOption,
  );
  // In the case of origin not allowed the header is not
  // written in the response.
  // https://github.com/fastify/fastify-cors/issues/127
  if (origin) {
    reply.header("Access-Control-Allow-Origin", origin);
  }

  if (config.credentials) {
    reply.header("Access-Control-Allow-Credentials", "true");
  }

  if (config.exposedHeaders) {
    reply.header(
      "Access-Control-Expose-Headers",
      Array.isArray(config.exposedHeaders)
        ? config.exposedHeaders.join(", ")
        : config.exposedHeaders,
    );
  }
}

function addPreflightHeaders(
  req: DenzoRequest,
  reply: DenzoReply,
  config: CorsConfig,
) {
  reply.header(
    "Access-Control-Allow-Methods",
    Array.isArray(config.methods) ? config.methods.join(", ") : config.methods,
  );

  if (!config.allowedHeaders) {
    vary(reply, "Access-Control-Request-Headers");
    const reqAllowedHeaders = req.headers.get("access-control-request-headers");
    if (reqAllowedHeaders) {
      reply.header("Access-Control-Allow-Headers", reqAllowedHeaders);
    }
  } else {
    reply.header(
      "Access-Control-Allow-Headers",
      Array.isArray(config.allowedHeaders)
        ? config.allowedHeaders.join(", ")
        : config.allowedHeaders!,
    );
  }

  if (config.maxAge !== undefined) {
    reply.header("Access-Control-Max-Age", String(config.maxAge));
  }
}

function getAccessControlAllowOriginHeader(
  reqOrigin: string,
  originOption: OriginOption,
) {
  if (originOption === "*") {
    // allow any origin
    return "*";
  }

  if (typeof originOption === "string") {
    // fixed origin
    return originOption;
  }

  // reflect origin
  return isRequestOriginAllowed(reqOrigin, originOption) ? reqOrigin : false;
}

function isRequestOriginAllowed(
  reqOrigin: string,
  allowedOrigin: OriginOption,
) {
  if (Array.isArray(allowedOrigin)) {
    for (let i = 0; i < allowedOrigin.length; ++i) {
      if (isRequestOriginAllowed(reqOrigin, allowedOrigin[i])) {
        return true;
      }
    }
    return false;
  } else if (typeof allowedOrigin === "string") {
    return reqOrigin === allowedOrigin;
  } else if (allowedOrigin instanceof RegExp) {
    return allowedOrigin.test(reqOrigin);
  } else {
    return !!allowedOrigin;
  }
}

async function onRequest(
  options: CorsConfig,
  req: DenzoRequest,
  reply: DenzoReply,
) {
  // Always set Vary header
  // https://github.com/rs/cors/issues/10
  vary(reply, "Origin");
  const resolveOriginOption = typeof options.origin === "function"
    ? resolveOriginWrapper(options.origin)
    : (_: DenzoRequest) => (options.origin as string)!;

  const resolvedOriginOption = await resolveOriginOption(req);
  if (resolvedOriginOption === false) return;
  if (!resolvedOriginOption) {
    throw new Error("Invalid CORS origin option");
  }

  addCorsHeaders(req, reply, resolvedOriginOption, options);

  if (req.raw.method === "OPTIONS" && options.preflight === true) {
    // Strict mode enforces the required headers for preflight
    if (
      options.strictPreflight === true &&
      (!req.headers.get("origin") ||
        !req.headers.get("access-control-request-method"))
    ) {
      reply.status(400).send("Invalid Preflight Request");
      return;
    }

    req.set(corsPreflightEnabledKey, true);

    addPreflightHeaders(req, reply, options);

    if (!options.preflightContinue) {
      // Do not call the hook callback and terminate the request
      // Safari (and potentially other browsers) need content-length 0,
      // for 204 or they just hang waiting for a body
      reply
        .status(options.optionsSuccessStatus)
        .header("Content-Length", "0")
        .send();
      return;
    }
  }
}
