import { test, expect, type Page } from "@playwright/test";
import { randomUUID } from "node:crypto";
async function signup(page: Page, name: string) {
  const email = `${randomUUID()}@example.test`;
  await page.goto("/");
  await page
    .getByRole("button", { name: "Sign up with email instead", exact: true })
    .click();
  await page.getByLabel("Your name", { exact: true }).fill(name);
  await page.getByLabel("Email address", { exact: true }).fill(email);
  await page
    .getByLabel("Password", { exact: true })
    .fill("Local-Only-Test-Password!");
  await page
    .getByRole("button", { name: "Create your Wasl account", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Network", exact: true }),
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
  await page.getByRole("button", { name: "Search", exact: true }).click();
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
      name: "Cards",
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
  await page.getByRole("button", { name: "Add card", exact: true }).click();
  // every account starts with a Professional card; share the new one
  await expect(
    page.getByRole("button", { name: "Share card", exact: true }),
  ).toHaveCount(2);
  await page
    .getByRole("button", { name: "Share card", exact: true })
    .last()
    .click();
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
    // Bob saves Alice's card and sends his own back in the same tap
    await bob.getByRole("button", { name: "Swap cards", exact: true }).click();
    await expect(
      bob.getByRole("heading", {
        name: "You swapped cards with Alice",
        exact: true,
      }),
    ).toBeVisible();
    await bob.getByRole("link", { name: "Open Alice", exact: true }).click();
    await expect(
      bob
        .getByRole("dialog", { name: "Connection details" })
        .getByRole("heading", { name: "Alice QA", exact: true }),
    ).toBeVisible();
    await expect(bob.getByText("Yousef Omar", { exact: true })).toHaveCount(0);
    // Alice's phone, still showing her code, says by itself that Bob's card came back
    await expect(
      page.getByRole("heading", {
        name: "You swapped cards with Bob",
        exact: true,
      }),
    ).toBeVisible({ timeout: 15000 });
    await page
      .getByRole("button", { name: "Show my code again", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Revoke this sharing link", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Revoke link", exact: true })
      .click();
    expect((await recipient.request.get(`/api/share/${token}`)).status()).toBe(
      404,
    );
    // closing the confirmation takes its step out of the browser history a moment later;
    // a person can't reload faster than that, so the test doesn't either
    await page.waitForTimeout(300);
    await page.reload();
    await page
      .getByRole("button", {
        name: info.project.name === "mobile" ? "Network" : "Network 2",
        exact: true,
      })
      .click();
    await expect(
      page.getByRole("heading", { name: "Yousef Omar", exact: true }),
    ).toBeVisible();
    // Bob's card came back to Alice, marked New
    await expect(
      page.getByText("Bob QA swapped cards with you", { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Bob QA", exact: true }),
    ).toBeVisible();
  } finally {
    await recipient.close();
  }
});
test("a card that comes back while your code is showing can be opened from there", async ({
  page,
  browser,
}) => {
  await signup(page, "Alice QA");
  await page.getByRole("button", { name: "Cards", exact: true }).click();
  await page.getByRole("button", { name: "Share card", exact: true }).click();
  // someone without Wasl: their paper card can be scanned from here too
  await expect(
    page.getByRole("button", { name: "Scan their card", exact: true }),
  ).toBeVisible();
  const linkField = page.getByLabel("Share link", { exact: true });
  await expect(linkField).toHaveValue(/\/c\/[A-Za-z0-9_-]{43}$/);
  const link = await linkField.inputValue();
  const recipient = await browser.newContext({
    baseURL: "http://127.0.0.1:3100",
  });
  try {
    const bob = await recipient.newPage();
    await signup(bob, "Bob QA");
    await bob.goto(link);
    await bob.getByRole("button", { name: "Swap cards", exact: true }).click();
    await expect(
      bob.getByRole("heading", {
        name: "You swapped cards with Alice",
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", {
        name: "You swapped cards with Bob",
        exact: true,
      }),
    ).toBeVisible({ timeout: 15000 });
    await page.getByRole("button", { name: "Open Bob", exact: true }).click();
    // Bob opens on the Network screen, and is no longer marked New
    await expect(
      page
        .getByRole("dialog", { name: "Connection details" })
        .getByRole("heading", { name: "Bob QA", exact: true }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "Close dialog", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: "Network", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Bob QA", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByText("Bob QA swapped cards with you", { exact: true }),
    ).toHaveCount(0);
    // the phone's Back button returns to the cards, where the code was
    await page.waitForTimeout(300);
    await page.goBack();
    await expect(
      page.getByRole("heading", { name: "My cards", exact: true }),
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
test("dark by default, with light or the phone's setting as choices", async ({
  page,
}) => {
  const theme = page.locator("html");
  // a phone in light mode still opens Wasl dark until the person picks otherwise
  await page.emulateMedia({ colorScheme: "light" });
  await signup(page, "Theme QA");
  await expect(theme).toHaveAttribute("data-theme", "dark");
  // the top bar switch picks light, and the choice is kept after a reload
  await page.getByRole("button", { name: "Switch to light mode" }).click();
  await expect(theme).toHaveAttribute("data-theme", "light");
  await page.reload();
  await expect(theme).toHaveAttribute("data-theme", "light");
  // Settings: follow the phone, then back to dark
  await page
    .locator("nav button:visible, aside button:visible")
    .filter({ hasText: "Settings" })
    .first()
    .click();
  await page.getByRole("radio", { name: "Match my phone" }).click();
  await expect(theme).toHaveAttribute("data-theme", "light");
  await page.emulateMedia({ colorScheme: "dark" });
  await expect(theme).toHaveAttribute("data-theme", "dark");
  await page.emulateMedia({ colorScheme: "light" });
  await page.getByRole("radio", { name: "Dark" }).click();
  await expect(theme).toHaveAttribute("data-theme", "dark");
});
test("search says when there is no one to search; sample people make it work and leave in one tap", async ({
  page,
}) => {
  await signup(page, "Search QA");
  await page.getByRole("button", { name: "Search", exact: true }).click();
  // nobody saved: no search box that can never find anyone
  await expect(
    page.getByRole("heading", { name: "There’s no one to search yet." }),
  ).toBeVisible();
  await expect(page.getByLabel("Search your memory")).toHaveCount(0);
  await page
    .getByRole("button", { name: "Try it with sample people", exact: true })
    .click();
  // the examples come from the saved people, so the first one finds someone
  const example = page.getByRole("button", {
    name: "Who did I meet at Web Summit Qatar?",
  });
  await example.click();
  await expect(
    page.getByRole("heading", { name: "Best matches", exact: true }),
  ).toBeInViewport();
  await expect(page.locator(".recall-result")).toHaveCount(3);
  // a note in your own words finds the person; the start of a name does too
  const box = page.getByLabel("Search your memory", { exact: true });
  const go = page.getByRole("button", {
    name: "Find connections",
    exact: true,
  });
  await box.fill("who offered to review my CV");
  await go.click();
  await expect(page.locator(".recall-result")).toHaveCount(1);
  await expect(page.locator(".recall-result h3")).toHaveText("Sara Nasser");
  // the box empties itself, ready for the next search; what was asked shows with the results
  await expect(box).toHaveValue("");
  await expect(page.locator(".asked q")).toHaveText(
    "who offered to review my CV",
  );
  // Edit brings a long description back instead of making you retype it
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await expect(box).toHaveValue("who offered to review my CV");
  // Enter searches too, and clears the box the same way
  await box.fill("cybersecurity");
  await box.press("Enter");
  await expect(page.locator(".asked q")).toHaveText("cybersecurity");
  await expect(box).toHaveValue("");
  await box.fill("mar");
  await go.click();
  await expect(page.locator(".recall-result h3")).toHaveText("Mariam Ali");
  // small talk finds no one, and says how many people were searched
  await box.fill("how r u");
  await go.click();
  await expect(
    page.getByRole("heading", { name: "No one matched", exact: true }),
  ).toBeInViewport();
  await expect(
    page.getByText("None of your 5 saved people match that."),
  ).toBeVisible();
  // sample people are marked on Network and leave together
  await page
    .getByRole("button", { name: /^Network/ })
    .first()
    .click();
  await expect(page.getByText("5 sample people are here")).toBeVisible();
  await page.getByRole("button", { name: "Remove them", exact: true }).click();
  await expect(
    page.getByRole("heading", {
      name: "Start with one meaningful connection.",
    }),
  ).toBeVisible();
});
test("Back closes the dialog on top, then returns to the screen before; a lost session returns to sign-in", async ({
  page,
  context,
}) => {
  const email = await signup(page, "Back QA");
  const heading = (name: string) =>
    page
      .getByRole("main")
      .getByRole("heading", { name, exact: true, level: 1 });
  const go = (name: string) =>
    page
      .locator("nav button:visible, aside button:visible")
      .filter({ hasText: name })
      .first()
      .click();
  await go("Cards");
  await go("Search");
  await expect(heading("Search")).toBeVisible();
  await page.goBack();
  await expect(heading("My cards")).toBeVisible();
  await page.goBack();
  await expect(heading("Network")).toBeVisible();

  // a dialog: Back closes it and stays on the same screen
  await page
    .getByRole("button", { name: "Just looking? Try it with sample people" })
    .click();
  await page.locator(".contact-card").first().click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.goBack();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(heading("Network")).toBeVisible();

  // one dialog closing as another opens (saving a new person opens their page), then moving on
  // straight away: Back still goes where it should
  await page
    .getByRole("button", { name: "Add a connection", exact: true })
    .first()
    .click();
  await page.getByLabel("Full name *", { exact: true }).fill("Quick Close");
  await page
    .getByRole("button", { name: "Save connection", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Quick Close", exact: true }).last(),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Close dialog", exact: true })
    .last()
    .click();
  await go("Cards");
  await go("Profile");
  await expect(heading("Profile")).toBeVisible();
  await page.goBack();
  await expect(heading("My cards")).toBeVisible();
  await page.goBack();
  await expect(heading("Network")).toBeVisible();

  // links typed the way people say them
  await go("Profile");
  await page.getByText("More details").click();
  await page
    .getByLabel("LinkedIn", { exact: true })
    .fill("linkedin.com/in/back-qa");
  await page.getByLabel("Instagram", { exact: true }).fill("@back.qa");
  await page.getByRole("button", { name: "Save profile" }).click();
  await expect(
    page.getByText("Your profile and active card links are updated."),
  ).toBeVisible();
  await expect(page.getByLabel("LinkedIn", { exact: true })).toHaveValue(
    "https://linkedin.com/in/back-qa",
  );
  await expect(page.getByLabel("Instagram", { exact: true })).toHaveValue(
    "https://instagram.com/back.qa",
  );

  // the session ends while the app is open: the next save lands on sign-in, with the reason
  await context.clearCookies();
  await page.getByRole("button", { name: "Save profile" }).click();
  await expect(
    page.getByText(
      "You were signed out. Sign in to carry on where you left off.",
    ),
  ).toBeVisible();
  // the sign-in form is ready, with help for a forgotten password
  await page.getByRole("button", { name: "Forgot your password?" }).click();
  await expect(
    page.getByText(/can.t reset a password by email yet/),
  ).toBeVisible();

  // signing up with an email that already has an account offers to sign in instead
  await page
    .getByRole("button", { name: "Create account", exact: true })
    .click();
  await page.getByLabel("Your name", { exact: true }).fill("Back QA");
  await page.getByLabel("Email address", { exact: true }).fill(email);
  await page
    .getByLabel("Password", { exact: true })
    .fill("Local-Only-Test-Password!");
  await page
    .getByRole("button", { name: "Create your Wasl account", exact: true })
    .click();
  await expect(
    page.getByText(
      "An account with this email already exists. Sign in instead.",
    ),
  ).toBeVisible();
  await page.getByRole("button", { name: "Sign in with this email" }).click();
  await page.locator("form").getByRole("button", { name: "Sign in" }).click();
  // back where they left off
  await expect(heading("Profile")).toBeVisible();
});

test("the first page offers a card scan, LinkedIn, email and sign-in, and each one works", async ({
  page,
}) => {
  const heading = (name: string) =>
    page.getByRole("heading", { name, exact: true });
  const choice = (name: string) =>
    page.getByRole("button", { name, exact: true });
  await page.goto("/");
  // the same first page as the mockup
  for (const name of [
    "Scan my business card",
    "Import from LinkedIn",
    "Sign up with email instead",
    "Sign in",
  ])
    await expect(choice(name)).toBeVisible();
  await expect(page.getByLabel("Email address", { exact: true })).toHaveCount(
    0,
  );

  // Sign in opens the sign-in form; Back (the link, then the browser's) returns to the first page
  await choice("Sign in").click();
  await expect(heading("Welcome back")).toBeVisible();
  await expect(page.getByLabel("Your name", { exact: true })).toHaveCount(0);
  await choice("Back").click();
  await expect(choice("Scan my business card")).toBeVisible();
  await choice("Sign up with email instead").click();
  await expect(heading("Create your account")).toBeVisible();
  await page.waitForTimeout(300);
  await page.goBack();
  await expect(choice("Scan my business card")).toBeVisible();

  // LinkedIn: a link that isn't a profile is refused in plain words
  await page.waitForTimeout(300);
  await choice("Import from LinkedIn").click();
  await page.getByLabel("Your LinkedIn link").fill("example.com/me");
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(
    page.getByText(/look like a LinkedIn profile link/),
  ).toBeVisible();
  await choice("Back").click();

  // scanning my own card (its text, here) fills the sign-up form and then my profile
  await page.waitForTimeout(300);
  await choice("Scan my business card").click();
  const scan = page.getByRole("dialog");
  await scan.getByRole("button", { name: "Paste text" }).click();
  await scan
    .getByLabel("Text from a business card, badge or profile")
    .fill(
      "Layla Hassan\nProduct Designer\nPearl Labs\nlayla.hassan@example.test\n+974 5555 0142\nlinkedin.com/in/layla-hassan",
    );
  await scan.getByRole("button", { name: "Review my details" }).click();
  await expect(heading("Create your account")).toBeVisible();
  await expect(page.getByText(/Found \d+ details on your card/)).toBeVisible();
  await expect(page.getByLabel("Your name", { exact: true })).toHaveValue(
    "Layla Hassan",
  );
  // the card's email is only a suggestion: sign up with another one
  const email = `${randomUUID()}@example.test`;
  await page.getByLabel("Email address", { exact: true }).fill(email);
  await page
    .getByLabel("Password", { exact: true })
    .fill("Local-Only-Test-Password!");
  await choice("Create your Wasl account").click();
  // the new profile opens first, already filled in
  await expect(heading("Profile")).toBeVisible();
  await expect(page.getByText("Your profile is ready")).toBeVisible();
  await expect(
    page.getByLabel("Full name", { exact: false }).first(),
  ).toHaveValue("Layla Hassan");
  await expect(page.getByLabel("Phone", { exact: true })).toHaveValue(
    /5555 0142/,
  );
  // the next step is the same as in the mockup: see the card Wasl made
  await choice("See my card").click();
  await expect(heading("My cards")).toBeVisible();
  await expect(
    page.locator(".digital-card").filter({ hasText: "Layla Hassan" }).first(),
  ).toBeVisible();
  await page.goBack();
  await expect(heading("Profile")).toBeVisible();
  // it was really saved, not only shown
  await page.reload();
  await expect(heading("Profile")).toBeVisible();
  await expect(page.getByLabel("Phone", { exact: true })).toHaveValue(
    /5555 0142/,
  );
  // the "profile is ready" notice was for the first visit only
  await expect(page.getByText("Your profile is ready")).toHaveCount(0);
  await page
    .locator("nav button:visible, aside button:visible")
    .filter({ hasText: "Network" })
    .first()
    .click();
  await expect(heading("Network")).toBeVisible();
});
test("signing up from a LinkedIn link puts the link and a first name on the profile", async ({
  page,
}) => {
  await page.goto("/");
  await page
    .getByRole("button", { name: "Import from LinkedIn", exact: true })
    .click();
  await page
    .getByLabel("Your LinkedIn link")
    .fill("linkedin.com/in/omar-haddad-1a2b3c");
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByText("Your LinkedIn link is ready")).toBeVisible();
  await expect(page.getByLabel("Your name", { exact: true })).toHaveValue(
    "Omar Haddad",
  );
  await page
    .getByLabel("Email address", { exact: true })
    .fill(`${randomUUID()}@example.test`);
  await page
    .getByLabel("Password", { exact: true })
    .fill("Local-Only-Test-Password!");
  await page
    .getByRole("button", { name: "Create your Wasl account", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Profile", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Your LinkedIn link is on it", { exact: false }),
  ).toBeVisible();
  // the links are already open, because one of them is filled in
  await expect(page.getByLabel("LinkedIn", { exact: true })).toHaveValue(
    "https://linkedin.com/in/omar-haddad-1a2b3c",
  );
});
