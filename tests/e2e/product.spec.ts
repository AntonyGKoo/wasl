import { test, expect, type Locator, type Page } from "@playwright/test";
import { randomUUID } from "node:crypto";
// Is this control fully on the first screen: inside the window, and not under the phone's
// tab bar at the bottom?
async function onFirstScreen(page: Page, control: Locator) {
  const box = await control.boundingBox();
  if (!box) return false;
  const bar = page.locator(".mobile-nav");
  const barBox = (await bar.isVisible()) ? await bar.boundingBox() : null;
  const floor = barBox ? barBox.y : page.viewportSize()!.height;
  return box.y >= 0 && box.y + box.height <= floor;
}
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
  // the three ways to add someone sit under one heading
  const add = page.getByRole("region", { name: "Add a connection" });
  await expect(add.getByRole("button")).toHaveCount(3);
  await add.getByRole("button", { name: /^Type it in/ }).click();
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
    .getByLabel("Add a note", { exact: true })
    .fill("Offered to introduce me to his CTO");
  // one Save for the page, at the bottom, which says what isn't saved yet and then that it is
  await expect(page.getByText("Your note isn't saved yet")).toBeVisible();
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByText("Saved to your private notes")).toBeVisible();
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
  // every account starts with a Professional card; the new one comes to the front of the
  // stack, the first one shows as a strip behind it, and Share shares the one in front
  await expect(
    page.getByRole("button", {
      name: "Show your Professional card",
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Share card", exact: true }),
  ).toHaveCount(1);
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
  // sharing is what this page is for: the button is on the first screen, phone included
  await expect(
    page.getByRole("button", { name: "Share card", exact: true }),
  ).toBeVisible();
  expect(
    await onFirstScreen(
      page,
      page.getByRole("button", { name: "Share card", exact: true }),
    ),
  ).toBe(true);
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
    // one scan, one tap: Swap is within reach without scrolling, and the confirmation is
    // brought into view after it
    const swap = bob.getByRole("button", { name: "Swap cards", exact: true });
    await expect(swap).toBeVisible();
    expect(await onFirstScreen(bob, swap)).toBe(true);
    await swap.click();
    const done = bob.getByRole("heading", {
      name: "You swapped cards with Alice",
      exact: true,
    });
    await expect(done).toBeVisible();
    await expect(done).toBeInViewport();
    await expect(
      page.getByRole("heading", {
        name: "You swapped cards with Bob",
        exact: true,
      }),
    ).toBeVisible({ timeout: 15000 });
    await page.getByRole("button", { name: "Open Bob", exact: true }).click();
    // someone who arrived by a swap never passed through the form: a tag is one tap here
    const tags = page
      .getByRole("dialog", { name: "Connection details" })
      .getByRole("group", { name: "Tags" });
    await tags.getByRole("button", { name: "Hiring", exact: true }).click();
    await expect(
      tags.getByRole("button", { name: "Hiring", exact: true }),
    ).toHaveAttribute("aria-pressed", "true");
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
    // the tag chosen on Bob's page is saved: grouping by tag puts him under it
    await page
      .getByRole("group", { name: "Group by" })
      .getByRole("button", { name: "Tag", exact: true })
      .click();
    await expect(page.getByRole("heading", { name: /^Hiring/ })).toBeVisible();
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
  await page.getByRole("button", { name: /^Scan a paper card/ }).click();
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
  await page.getByRole("button", { name: /^Type it in/ }).click();
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
// The phone's speech-to-text, standing in for a real microphone: it hears three sentences.
function fakeSpeech() {
  class Heard {
    lang = "en-US";
    continuous = true;
    interimResults = true;
    onresult: ((e: unknown) => void) | null = null;
    onerror: ((e: unknown) => void) | null = null;
    onend: (() => void) | null = null;
    timers: ReturnType<typeof setTimeout>[] = [];
    start() {
      [
        "Mariam leads the data team at Pearl Labs",
        "She offered to introduce me to her CTO",
        "Pearl Labs is hiring summer interns",
      ].forEach((transcript, i) =>
        this.timers.push(
          setTimeout(
            () => {
              const result = Object.assign([{ transcript }], { isFinal: true });
              this.onresult?.({ resultIndex: 0, results: [result] });
            },
            250 * (i + 1),
          ),
        ),
      );
    }
    stop() {
      this.timers.forEach(clearTimeout);
      setTimeout(() => this.onend?.(), 10);
    }
  }
  Object.assign(window, {
    SpeechRecognition: Heard,
    webkitSpeechRecognition: Heard,
  });
}
test("recording needs a yes on the other person's own phone; someone without Wasl can't be recorded", async ({
  page,
  browser,
}) => {
  await page.addInitScript(fakeSpeech);
  await signup(page, "Alice QA");
  const detail = page.getByRole("dialog", { name: "Connection details" });

  // someone typed in by hand isn't on Wasl: Wasl says why it won't record, and offers a note
  await page.getByRole("button", { name: /^Type it in/ }).click();
  await page.getByLabel("Full name *", { exact: true }).fill("Paper Person");
  await page
    .getByRole("button", { name: "Save connection", exact: true })
    .click();
  await expect(
    detail.getByText(
      "Recording works only when Paper has Wasl and says yes on their own phone.",
    ),
  ).toBeVisible();
  await detail
    .getByRole("button", { name: "Record the chat", exact: true })
    .click();
  await expect(detail.getByText("Paper needs Wasl for this")).toBeVisible();
  await expect(
    detail.getByText(/isn’t on Wasl, so nothing will be recorded/),
  ).toBeVisible();
  await detail
    .getByRole("button", { name: "Type a note", exact: true })
    .click();
  await expect(detail.getByLabel("Add a note", { exact: true })).toBeFocused();
  await expect(detail.getByText("Listening")).toHaveCount(0);
  await page.getByRole("button", { name: "Close dialog", exact: true }).click();

  // Alice shows her code and Bob swaps cards with her: both are on Wasl
  await page.getByRole("button", { name: "Cards", exact: true }).click();
  await page.getByRole("button", { name: "Share card", exact: true }).click();
  const linkField = page.getByLabel("Share link", { exact: true });
  await expect(linkField).toHaveValue(/\/c\/[A-Za-z0-9_-]{43}$/);
  const link = await linkField.inputValue();
  const other = await browser.newContext({ baseURL: "http://127.0.0.1:3100" });
  try {
    const bob = await other.newPage();
    await signup(bob, "Bob QA");
    await bob.goto(link);
    await bob.getByRole("button", { name: "Swap cards", exact: true }).click();
    await expect(
      bob.getByRole("heading", { name: "You swapped cards with Alice" }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "You swapped cards with Bob" }),
    ).toBeVisible({ timeout: 15000 });
    await page.getByRole("button", { name: "Open Bob", exact: true }).click();
    await expect(
      detail.getByText("Wasl asks Bob on their phone first."),
    ).toBeVisible();

    // Alice asks; Bob's phone, still on the card he just swapped, asks him
    await detail
      .getByRole("button", { name: "Record the chat", exact: true })
      .click();
    await expect(detail.getByText("Asking Bob on their phone…")).toBeVisible();
    const question = bob.getByRole("alertdialog", {
      name: "Can Alice record your chat?",
    });
    await expect(question).toBeVisible({ timeout: 15000 });
    await expect(question.getByText("No audio is kept.")).toBeVisible();
    await question.getByRole("button", { name: "Allow", exact: true }).click();
    await expect(question).toHaveCount(0);

    // his yes reaches Alice; only then can she start
    await expect(detail.getByText("Bob said yes")).toBeVisible({
      timeout: 10000,
    });
    await detail
      .getByRole("button", { name: "Start recording", exact: true })
      .click();
    await expect(detail.getByText(/Listening/)).toBeVisible();
    // while it's going, Bob's phone says so and has a Stop button
    await expect(
      bob.getByText("Alice is taking notes of your chat"),
    ).toBeVisible({ timeout: 15000 });
    await expect(detail.getByText(/introduce me to her CTO/)).toBeVisible();
    await detail
      .getByRole("button", { name: "Stop and make key points", exact: true })
      .click();
    // the key points wait for the page's Save, which says they aren't saved yet
    const points = detail.getByRole("textbox", { name: /Key points/ });
    await expect(points).toHaveValue(/introduce me to her CTO/);
    await expect(
      detail.getByText("Your key points aren't saved yet"),
    ).toBeVisible();
    await expect(
      detail.getByText("Check them, then tap Save at the bottom."),
    ).toBeVisible();
    const save = detail.getByRole("button", { name: "Save", exact: true });
    await expect(save).toBeInViewport();
    await save.click();
    await expect(detail.getByText("Saved to your private notes")).toBeVisible();
    await expect(
      detail.locator(".timeline article.fresh").getByText(/her CTO/),
    ).toBeVisible();
    await expect(detail.getByRole("button", { name: "Saved" })).toBeDisabled();
    // Alice stopped, so Bob's phone stops saying a recording is going
    await expect(
      bob.getByText("Alice is taking notes of your chat"),
    ).toHaveCount(0, { timeout: 15000 });

    // Bob can stop a recording from his phone: nothing of it is kept
    await detail
      .getByRole("button", { name: "Record the chat", exact: true })
      .click();
    await question
      .getByRole("button", { name: "Allow", exact: true })
      .click({ timeout: 15000 });
    await detail
      .getByRole("button", { name: "Start recording", exact: true })
      .click({ timeout: 10000 });
    await bob
      .getByRole("status")
      .filter({ hasText: "Alice is taking notes of your chat" })
      .getByRole("button", { name: "Stop", exact: true })
      .click({ timeout: 15000 });
    await expect(
      detail.getByText(
        "Bob stopped the recording on their phone, so nothing was kept.",
      ),
    ).toBeVisible({ timeout: 10000 });
    await expect(detail.getByText("Everything here is saved")).toBeVisible();

    // and a no is a no
    await detail
      .getByRole("button", { name: "Record the chat", exact: true })
      .click();
    await question
      .getByRole("button", { name: "Don’t allow", exact: true })
      .click({ timeout: 15000 });
    await expect(
      detail.getByText("Bob said no, so nothing was recorded."),
    ).toBeVisible({ timeout: 10000 });
    await expect(detail.getByText(/her CTO/)).toHaveCount(1);
  } finally {
    await other.close();
  }
});
test("a typed note is saved by the one Save at the bottom, or when the page is closed", async ({
  page,
}) => {
  await signup(page, "Save QA");
  await page.getByRole("button", { name: /^Type it in/ }).click();
  await page.getByLabel("Full name *", { exact: true }).fill("Noor Saleh");
  await page
    .getByRole("button", { name: "Save connection", exact: true })
    .click();
  const detail = page.getByRole("dialog", { name: "Connection details" });
  // nothing to save yet: the button says so instead of doing nothing
  await expect(detail.getByText("Everything here is saved")).toBeVisible();
  await expect(detail.getByRole("button", { name: "Saved" })).toBeDisabled();
  await expect(detail.getByRole("button", { name: "Saved" })).toBeInViewport();
  // a note written and then the page closed is kept, not lost
  await detail
    .getByLabel("Add a note", { exact: true })
    .fill("Wants feedback on her research plan");
  await expect(detail.getByText("Your note isn't saved yet")).toBeVisible();
  await page.getByRole("button", { name: "Close dialog", exact: true }).click();
  await expect(detail).toHaveCount(0);
  await page.getByRole("heading", { name: "Noor Saleh", exact: true }).click();
  await expect(
    detail.getByText("Wants feedback on her research plan", { exact: true }),
  ).toBeVisible();
});
test("My cards is a stack: tap a card behind to bring it to the front, and it stays there", async ({
  page,
}) => {
  await signup(page, "Stack QA");
  // Network: the three ways to add someone are under one heading, on the first screen
  const add = page.getByRole("region", { name: "Add a connection" });
  await expect(
    add.getByRole("heading", { name: "Add a connection" }),
  ).toBeVisible();
  for (const name of [/^Scan their code/, /^Scan a paper card/, /^Type it in/])
    expect(await onFirstScreen(page, add.getByRole("button", { name }))).toBe(
      true,
    );
  await page.getByRole("button", { name: "Cards", exact: true }).click();
  await page
    .getByRole("button", { name: "Create a card", exact: true })
    .click();
  await page
    .getByRole("combobox", { name: /^Card type/ })
    .selectOption("event");
  await page.getByRole("button", { name: "Add card", exact: true }).click();
  // the new card is in front, the first one is a strip behind it
  const front = page.locator(".stack-details h3");
  await expect(front).toHaveText("Event");
  const behind = page.getByRole("button", {
    name: "Show your Professional card",
    exact: true,
  });
  await expect(behind).toBeVisible();
  await expect(behind).toContainText("Name");
  await behind.click();
  await expect(front).toHaveText("Professional");
  await expect(
    page.getByRole("button", { name: "Show your Event card", exact: true }),
  ).toBeVisible();
  // Share is for the card in front, and stays on the first screen
  const share = page.getByRole("button", { name: "Share card", exact: true });
  expect(await onFirstScreen(page, share)).toBe(true);
  // the choice is remembered on this phone
  await page.reload();
  await expect(front).toHaveText("Professional");
});
