import { test, expect, type Page } from "@playwright/test";
import { randomUUID } from "node:crypto";
async function signup(page: Page, name: string) {
  const email = `${randomUUID()}@example.test`;
  await page.goto("/");
  await page.getByLabel("Your name", { exact: true }).fill(name);
  await page.getByLabel("Email address", { exact: true }).fill(email);
  await page
    .getByLabel("Password", { exact: true })
    .fill("Local-Only-Test-Password!");
  await page
    .getByRole("button", { name: "Create your Wasl account", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Your network", exact: true }),
  ).toBeVisible();
  return email;
}
test("two people share selected details, retain private memory, recall and revoke", async ({
  page,
  browser,
}, info) => {
  const email = await signup(page, "Alice QA");
  await page
    .getByRole("button", { name: "Add a connection", exact: true })
    .click();
  await page.getByLabel("Full name *", { exact: true }).fill("Yousef Omar");
  await page
    .getByLabel("Role / job title", { exact: true })
    .fill("Backend engineer");
  await page
    .getByLabel("Event or occasion", { exact: true })
    .fill("Web Summit Qatar");
  await page
    .getByRole("button", { name: "Save connection", exact: true })
    .click();
  await page
    .getByLabel("Add an interaction or something to remember", { exact: true })
    .fill("Offered to introduce me to his CTO");
  await page.getByRole("button", { name: "Save memory", exact: true }).click();
  await expect(
    page.getByText("Offered to introduce me to his CTO", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Close dialog", exact: true }).click();
  await page.getByRole("button", { name: "Recall", exact: true }).click();
  await page
    .getByLabel("Search your memory", { exact: true })
    .fill("software engineer Web Summit");
  await page
    .getByRole("button", { name: "Find connections", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Yousef Omar", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", {
      name: info.project.name === "mobile" ? "Cards" : "Your cards",
      exact: true,
    })
    .click();
  await page
    .getByRole("button", { name: "Create a card", exact: true })
    .click();
  await page.getByLabel("Card name", { exact: true }).fill("Professional");
  await page
    .getByRole("checkbox", { name: `Email ${email}`, exact: true })
    .uncheck();
  await page.getByRole("button", { name: "Save card", exact: true }).click();
  await page.getByRole("button", { name: "Share card", exact: true }).click();
  const linkField = page.getByLabel("Share link", { exact: true });
  await expect(linkField).toHaveValue(/\/c\/[A-Za-z0-9_-]{43}$/);
  const link = await linkField.inputValue();
  const token = link.split("/").at(-1)!;
  const recipient = await browser.newContext({
    baseURL: "http://127.0.0.1:3100",
  });
  try {
    const response = await recipient.request.get(`/api/share/${token}`);
    const body = await response.json();
    expect(response.status()).toBe(200);
    expect(body.card.profile).toEqual({ name: "Alice QA" });
    const bob = await recipient.newPage();
    await signup(bob, "Bob QA");
    await bob.goto(link);
    await bob
      .getByLabel("Where did you meet?", { exact: true })
      .fill("Career Fair");
    await bob
      .getByRole("button", { name: "Save to my Wasl network", exact: true })
      .click();
    await expect(
      bob.getByText("A new connection. A story to keep.", { exact: true }),
    ).toBeVisible();
    await bob
      .getByRole("link", { name: "Open your network", exact: true })
      .click();
    await expect(
      bob.getByRole("heading", { name: "Alice QA", exact: true }),
    ).toBeVisible();
    await expect(bob.getByText("Yousef Omar", { exact: true })).toHaveCount(0);
    await page
      .getByRole("button", { name: "Revoke this sharing link", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Revoke link", exact: true })
      .click();
    expect((await recipient.request.get(`/api/share/${token}`)).status()).toBe(
      404,
    );
    await page.reload();
    await page
      .getByRole("button", {
        name: info.project.name === "mobile" ? "Network" : "Your network 1",
        exact: true,
      })
      .click();
    await expect(
      page.getByRole("heading", { name: "Yousef Omar", exact: true }),
    ).toBeVisible();
  } finally {
    await recipient.close();
  }
});
test("text capture always requires review before saving", async ({ page }) => {
  await signup(page, "Scan QA");
  await page.getByRole("button", { name: "Scan a card", exact: true }).click();
  await page.getByRole("button", { name: "Paste text", exact: true }).click();
  await page
    .getByLabel("Text from a business card, badge or profile", { exact: true })
    .fill("Sara Smith\nsara@example.test\n+974 5555 1234");
  await page
    .getByRole("button", { name: "Review contact details", exact: true })
    .click();
  await expect(page.getByLabel("Full name *", { exact: true })).toHaveValue(
    "Sara Smith",
  );
  await expect(page.getByLabel("Email", { exact: true })).toHaveValue(
    "sara@example.test",
  );
  await page
    .getByRole("button", { name: "Save connection", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Sara Smith", exact: true }).last(),
  ).toBeVisible();
});
