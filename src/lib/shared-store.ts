import { promises as fs } from "fs";
import path from "path";
import { initialCategories, initialRecipes } from "@/lib/seed";
import type { Category, Recipe } from "@/lib/types";

export interface SharedKitchen {
  categories: Category[];
  recipes: Recipe[];
  updatedAt: string;
}

const DATA_FILE = path.join(process.cwd(), "data", "shared-kitchen.json");
const REPO = process.env.GITHUB_REPO || "ValentynPi/oselya-kitchen";
const DATA_PATH = "data/shared-kitchen.json";
const BRANCH = process.env.GITHUB_BRANCH || "main";

function defaultKitchen(): SharedKitchen {
  return {
    categories: initialCategories,
    recipes: initialRecipes.map((r) => ({ ...r, visibility: "shared" as const })),
    updatedAt: new Date().toISOString(),
  };
}

function shouldUseGitHub(): boolean {
  return Boolean(process.env.GITHUB_TOKEN) && process.env.SHARED_STORE !== "local";
}

async function readLocal(): Promise<SharedKitchen> {
  try {
    const raw = await fs.readFile(DATA_FILE, "utf8");
    return JSON.parse(raw) as SharedKitchen;
  } catch {
    const kitchen = defaultKitchen();
    await writeLocal(kitchen);
    return kitchen;
  }
}

async function writeLocal(kitchen: SharedKitchen): Promise<void> {
  await fs.mkdir(path.dirname(DATA_FILE), { recursive: true });
  await fs.writeFile(DATA_FILE, JSON.stringify(kitchen, null, 2), "utf8");
}

async function readGitHub(): Promise<{ kitchen: SharedKitchen; sha: string | null }> {
  const token = process.env.GITHUB_TOKEN!;
  const res = await fetch(
    `https://api.github.com/repos/${REPO}/contents/${DATA_PATH}?ref=${BRANCH}`,
    {
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${token}`,
        "X-GitHub-Api-Version": "2022-11-28",
      },
      cache: "no-store",
    },
  );

  if (res.status === 404) {
    return { kitchen: defaultKitchen(), sha: null };
  }

  if (!res.ok) {
    throw new Error(`GitHub read failed: ${res.status}`);
  }

  const json = (await res.json()) as { content: string; encoding: string; sha: string };
  const decoded = Buffer.from(json.content, "base64").toString("utf8");
  return { kitchen: JSON.parse(decoded) as SharedKitchen, sha: json.sha };
}

async function writeGitHub(kitchen: SharedKitchen, sha: string | null): Promise<void> {
  const token = process.env.GITHUB_TOKEN!;
  const body = {
    message: `chore: sync shared recipes (${kitchen.recipes.length})`,
    content: Buffer.from(JSON.stringify(kitchen, null, 2), "utf8").toString("base64"),
    branch: BRANCH,
    ...(sha ? { sha } : {}),
  };

  const res = await fetch(`https://api.github.com/repos/${REPO}/contents/${DATA_PATH}`, {
    method: "PUT",
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "X-GitHub-Api-Version": "2022-11-28",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`GitHub write failed: ${res.status} ${text}`);
  }
}

async function readFromRawGitHub(): Promise<SharedKitchen> {
  const res = await fetch(
    `https://raw.githubusercontent.com/${REPO}/${BRANCH}/${DATA_PATH}?t=${Date.now()}`,
    { cache: "no-store" },
  );
  if (!res.ok) return defaultKitchen();
  return (await res.json()) as SharedKitchen;
}

export async function getSharedKitchen(): Promise<SharedKitchen> {
  if (shouldUseGitHub()) {
    const { kitchen } = await readGitHub();
    return kitchen;
  }
  if (process.env.VERCEL === "1") {
    return readFromRawGitHub();
  }
  return readLocal();
}

export async function saveSharedKitchen(kitchen: SharedKitchen): Promise<SharedKitchen> {
  const next = { ...kitchen, updatedAt: new Date().toISOString() };

  if (shouldUseGitHub()) {
    for (let attempt = 0; attempt < 3; attempt++) {
      const { sha } = await readGitHub();
      try {
        await writeGitHub(next, sha);
        return next;
      } catch (err) {
        if (attempt === 2) throw err;
      }
    }
  }

  if (process.env.VERCEL === "1" && !process.env.GITHUB_TOKEN) {
    throw new Error(
      "GITHUB_TOKEN is required on Vercel to save shared recipes for all visitors",
    );
  }

  await writeLocal(next);
  return next;
}
