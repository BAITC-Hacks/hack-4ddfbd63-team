import nextEnv from "@next/env";
import OpenAI from "openai";

const { loadEnvConfig } = nextEnv;
loadEnvConfig(process.cwd());

const requiredVariables = [
  "EKT_API_URL",
  "EKT_API_USER",
  "EKT_API_PASSWORD",
  "OPENAI_API_KEY",
];

const missingVariables = requiredVariables.filter((name) => !process.env[name]?.trim());
if (missingVariables.length > 0) {
  console.error(
    JSON.stringify({ check: "environment", ok: false, missingVariables }),
  );
  process.exitCode = 1;
} else {
  console.log(JSON.stringify({ check: "environment", ok: true }));
}

function recordKeys(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? Object.keys(value)
    : [];
}

async function checkEkt() {
  if (missingVariables.some((name) => name.startsWith("EKT_"))) return false;

  const baseUrl = process.env.EKT_API_URL.trim().replace(/\/$/, "");
  const credentials = Buffer.from(
    `${process.env.EKT_API_USER}:${process.env.EKT_API_PASSWORD}`,
  ).toString("base64");
  const headers = {
    Accept: "application/json",
    Authorization: `Basic ${credentials}`,
  };

  try {
    const productsResponse = await fetch(`${baseUrl}/products`, {
      headers,
      cache: "no-store",
      signal: AbortSignal.timeout(15_000),
    });
    const products = await productsResponse.json();
    const items = Array.isArray(products?.items) ? products.items : [];
    console.log(
      JSON.stringify({
        check: "GET /products",
        ok: productsResponse.ok,
        status: productsResponse.status,
        topLevelKeys: recordKeys(products),
        itemCount: items.length,
        firstItemKeys: recordKeys(items[0]),
      }),
    );

    const detailResponse = await fetch(`${baseUrl}/products/detail?id=515291`, {
      headers,
      cache: "no-store",
      signal: AbortSignal.timeout(15_000),
    });
    const detail = await detailResponse.json();
    console.log(
      JSON.stringify({
        check: "GET /products/detail?id=515291",
        ok: detailResponse.ok && String(detail?.id) === "515291",
        status: detailResponse.status,
        idMatches: String(detail?.id) === "515291",
        topLevelKeys: recordKeys(detail),
        storeCount: Array.isArray(detail?.stores) ? detail.stores.length : 0,
        propertyCount: recordKeys(detail?.properties).length,
      }),
    );

    return productsResponse.ok && detailResponse.ok && String(detail?.id) === "515291";
  } catch (error) {
    console.error(
      JSON.stringify({
        check: "EKT API",
        ok: false,
        errorType: error instanceof Error ? error.name : "UnknownError",
      }),
    );
    return false;
  }
}

async function checkOpenAI() {
  if (!process.env.OPENAI_API_KEY?.trim()) return false;

  try {
    const client = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
      timeout: 30_000,
      maxRetries: 1,
    });
    const response = await client.responses.create({
      model: process.env.OPENAI_MODEL ?? "gpt-5-mini",
      input: "Reply with exactly: OK",
      max_output_tokens: 256,
    });
    const ok = response.status === "completed" && response.output_text.trim().length > 0;
    console.log(
      JSON.stringify({
        check: "OpenAI Responses API",
        ok,
        status: response.status,
        hasOutputText: response.output_text.trim().length > 0,
      }),
    );
    return ok;
  } catch (error) {
    console.error(
      JSON.stringify({
        check: "OpenAI Responses API",
        ok: false,
        status: error instanceof OpenAI.APIError ? error.status : null,
        code: error instanceof OpenAI.APIError ? error.code : null,
        errorType: error instanceof Error ? error.name : "UnknownError",
      }),
    );
    return false;
  }
}

const [ektOk, openaiOk] = await Promise.all([checkEkt(), checkOpenAI()]);
if (!ektOk || !openaiOk || missingVariables.length > 0) process.exitCode = 1;
