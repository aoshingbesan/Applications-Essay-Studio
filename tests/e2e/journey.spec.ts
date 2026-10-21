import { expect, test, type Page } from "@playwright/test";

// The complete applicant journey through the real UI.
test.describe.configure({ mode: "serial" });

const email = `applicant-${Date.now()}@example.test`;
const password = "correct-horse-battery";
const EXEMPLAR = Array.from(
  { length: 5 },
  (_, i) => `Paragraph ${i + 1}. When the river flooded our village I learned that leadership begins with listening to the people most affected by a decision, and that small, patient actions matter.`,
).join("\n\n");

let page: Page;

test.beforeAll(async ({ browser }) => {
  page = await browser.newPage();
});

test.afterAll(async () => {
  await page.close();
});

async function signIn() {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/$/);
}

test("1. create an account and see the first-run dashboard", async () => {
  await page.goto("/");
  await expect(page).toHaveURL(/\/login/);
  await page.getByRole("tab", { name: "Create account" }).click();
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByRole("heading", { name: "Welcome to Essay Studio" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Getting started" })).toBeVisible();
});

test("2. build the personal profile and story bank", async () => {
  await page.goto("/profile");
  await page.getByRole("button", { name: "Add to Education" }).click();
  await page.getByLabel("Title").fill("BSc Computer Science, University of Lagos");
  await page.getByRole("button", { name: "Save entry" }).click();
  await expect(page.getByText("BSc Computer Science, University of Lagos")).toBeVisible();

  await page.goto("/stories/new");
  await page.getByLabel("Story title").fill("Founded a community coding club");
  await page.getByLabel("Your actions").fill("Negotiated free use of the library and recruited four volunteer mentors.");
  await page.getByLabel("Outcome").fill("The club grew to 60 members.");
  await page.getByRole("button", { name: "Save story" }).click();
  await expect(page).toHaveURL(/\/stories\/[0-9a-f-]{36}$/);
  await expect(page.getByRole("heading", { name: "Founded a community coding club" })).toBeVisible();
});

test("2b. import evidence from Recommendation Letter Studio", async ({ request }) => {
  await request.get(`http://127.0.0.1:54329/__seed-letter-evidence?email=${encodeURIComponent(email)}`);
  await page.goto("/stories");
  await page.getByRole("button", { name: "Import from Letter Studio" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel(/Led the hospital data dashboard project/).check();
  await dialog.getByRole("button", { name: /Import 1 selected/ }).click();
  await expect(page.getByRole("heading", { name: "Led the hospital data dashboard project" })).toBeVisible();
  await page.getByRole("button", { name: "Import from Letter Studio" }).click();
  await expect(page.getByRole("dialog").getByText("Already imported")).toBeVisible();
  await page.keyboard.press("Escape");
});

test("3. create an application with an essay prompt and a supporting document", async () => {
  await page.goto("/applications/new");
  await page.getByLabel(/Institution or organisation/).fill("UK Foreign, Commonwealth & Development Office");
  await page.getByLabel(/Programme or scholarship/).fill("Chevening Scholarship");
  await page.getByRole("button", { name: "Save and continue" }).click();
  await expect(page).toHaveURL(/setup\?step=2/);

  await page.getByRole("button", { name: "Add essay question" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel(/Essay title/).fill("Leadership and influencing");
  await dialog.getByLabel(/Exact essay prompt/).fill("Describe how you have demonstrated leadership and influencing skills.");
  await dialog.getByLabel(/Maximum word count/).fill("500");
  await dialog.getByRole("button", { name: "Add essay" }).click();
  await expect(page.getByText("Leadership and influencing", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: /Continue/ }).click();
  await expect(page).toHaveURL(/setup\?step=3/);

  await page.getByRole("button", { name: "Add document" }).click();
  const docDialog = page.getByRole("dialog");
  await docDialog.getByLabel("Title").fill("CV");
  await docDialog.getByRole("button", { name: "Paste text instead" }).click();
  await docDialog.getByLabel("Document text").fill("Coding club founder. Led weekly sessions for 60 members.");
  await docDialog.getByRole("button", { name: "Save document" }).click();
  await expect(page.getByText("Text extracted")).toBeVisible();
  await page.getByRole("button", { name: /Continue/ }).click();
  await expect(page).toHaveURL(/setup\?step=4/);
  await page.getByRole("button", { name: "Finish setup" }).click();
  await expect(page.getByRole("heading", { name: "Chevening Scholarship" })).toBeVisible();
});

test("4. upload and analyse an exemplar, then select lessons for the essay", async () => {
  await page.goto("/exemplars");
  await page.getByRole("button", { name: "Upload exemplar" }).first().click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel(/^Title/).fill("Published leadership essay");
  await dialog.getByText("Officially Published Sample").click();
  await dialog.getByRole("tab", { name: "Paste text" }).click();
  await dialog.getByLabel("Essay text").fill(EXEMPLAR);
  await dialog.getByLabel(/I have permission/).check();
  await dialog.getByRole("button", { name: "Save exemplar" }).click();
  await expect(page).toHaveURL(/\/exemplars\/[0-9a-f-]{36}$/);
  await expect(page.getByRole("heading", { name: "Essay text" })).toBeVisible();

  await page.getByRole("button", { name: "Analyse", exact: true }).click();
  await expect(page.getByRole("heading", { name: "A. Overview" })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole("heading", { name: "I. Writing blueprint" })).toBeVisible();
  await page.getByLabel("Opening technique").check();
  await expect(page.getByLabel("Opening technique")).toBeChecked();
});

test("5. generate an outline and an original draft in the Essay Studio", async () => {
  await page.goto("/studio");
  await page.getByRole("link", { name: /Leadership and influencing/ }).click();
  const editor = page.getByRole("textbox", { name: /essay text/ });
  await expect(editor).toBeVisible();

  await page.getByRole("tab", { name: "Workflow" }).click();
  await page.getByRole("button", { name: "Analyse prompt" }).click();
  await expect(page.getByText("Why this programme, and how has your experience prepared you for it?")).toBeVisible();

  await page.getByRole("button", { name: "Generate outline" }).click();
  await expect(page.getByLabel("Thesis or central argument")).toHaveValue(/coding club/);
  await page.getByRole("button", { name: "Approve outline" }).click();
  await expect(page.getByRole("button", { name: "Approved" })).toBeVisible();

  await page.getByRole("button", { name: "Generate draft" }).click();
  const dialog = page.getByRole("dialog", { name: "Generated draft" });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "Use this draft" }).click();
  await expect(editor).toContainText("one borrowed laptop");
});

test("6. edit, autosave, save a version and accept an AI revision", async () => {
  const editor = page.getByRole("textbox", { name: /essay text/ });
  await editor.click();
  await page.keyboard.press("End");
  await page.keyboard.type(" I kept a log of every session.");
  await expect(page.getByRole("status").filter({ hasText: /Saved/ })).toBeVisible({ timeout: 15_000 });

  await page.getByRole("button", { name: "Save version" }).click();
  await page.getByLabel("Draft name (optional)").fill("My edited draft");
  await page.getByRole("button", { name: "Save version" }).last().click();
  await expect(page.getByText("Version saved")).toBeVisible();

  await page.getByRole("tab", { name: "Assist" }).click();
  await editor.getByText("one borrowed laptop").click();
  await page.getByRole("button", { name: "Improve Clarity" }).click();
  await expect(page.getByRole("region", { name: "Proposed revision" })).toBeVisible();
  await page.getByRole("button", { name: "Accept" }).click();
  await expect(editor).toContainText("(revised)");
});

test("7. review the essay against its requirements", async () => {
  await page.getByRole("tab", { name: "Review" }).click();
  await page.getByRole("button", { name: "Run checks" }).click();
  await expect(page.getByText(/words$/).first()).toBeVisible();
  await page.getByRole("button", { name: "Review draft" }).click();
  await expect(page.getByText("The draft answers the prompt; one example needs more specific evidence.")).toBeVisible();
  await expect(page.getByText("General closing")).toBeVisible();
});

test("8. restore a previous version", async () => {
  const editor = page.getByRole("textbox", { name: /essay text/ });
  await page.getByRole("button", { name: /Versions/ }).click();
  await page.getByRole("menuitem", { name: /My edited draft/ }).click();
  await page.getByRole("button", { name: "Restore this version" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Restore" }).click();
  await expect(editor).not.toContainText("(revised)");
  await expect(editor).toContainText("I kept a log of every session.");
});

test("9. export the final draft", async () => {
  await page.getByRole("button", { name: "Export" }).click();
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Word (.docx)" }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe("leadership-and-influencing.docx");
  const pdfPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "PDF" }).click();
  expect((await pdfPromise).suggestedFilename()).toBe("leadership-and-influencing.pdf");
  await page.keyboard.press("Escape");
});

test("10. progress persists and appears on the dashboard after signing in again", async () => {
  await page.context().clearCookies();
  await signIn();
  await expect(page.getByRole("link", { name: /Chevening Scholarship/ }).first()).toBeVisible();
  await expect(page.getByRole("link", { name: /Leadership and influencing/ })).toBeVisible();
});

test("11. pages fit a phone screen and support keyboard navigation", async () => {
  await page.setViewportSize({ width: 390, height: 844 });
  for (const path of ["/", "/applications", "/stories", "/exemplars", "/profile", "/documents", "/settings"]) {
    await page.goto(path);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow, `${path} scrolls horizontally`).toBeLessThanOrEqual(1);
  }
  await page.getByRole("button", { name: "Open navigation" }).click();
  await expect(page.getByRole("link", { name: "Story Bank" })).toBeVisible();
  await page.keyboard.press("Escape");
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  await page.keyboard.press("Tab");
  await expect(page.getByRole("link", { name: "Skip to content" })).toBeFocused();
});

test("12. screenshots of key screens (opt-in: SCREENSHOTS=dir)", async () => {
  const dir = process.env.SCREENSHOTS;
  test.skip(!dir, "Set SCREENSHOTS to a directory to capture screenshots");
  await page.setViewportSize({ width: 1440, height: 900 });
  const shots: [string, string][] = [
    ["dashboard", "/"],
    ["applications", "/applications"],
    ["stories", "/stories"],
    ["exemplars", "/exemplars"],
    ["profile", "/profile"],
    ["settings", "/settings"],
  ];
  for (const [name, path] of shots) {
    await page.goto(path);
    await page.waitForLoadState("networkidle");
    await page.screenshot({ path: `${dir}/${name}.png`, fullPage: false });
  }
  await page.goto("/applications");
  await page.getByRole("link", { name: /Chevening Scholarship/ }).first().click();
  await page.waitForLoadState("networkidle");
  await page.screenshot({ path: `${dir}/application.png` });
  await page.goto("/exemplars");
  await page.getByRole("link", { name: "Published leadership essay" }).click();
  await page.waitForLoadState("networkidle");
  await page.screenshot({ path: `${dir}/exemplar.png` });
  await page.goto("/studio");
  await page.getByRole("link", { name: /Leadership and influencing/ }).click();
  await expect(page.getByRole("textbox", { name: /essay text/ })).toBeVisible();
  await page.screenshot({ path: `${dir}/workspace.png` });
  await page.getByRole("tab", { name: "Workflow" }).click();
  await page.screenshot({ path: `${dir}/workspace-workflow.png` });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.screenshot({ path: `${dir}/mobile-dashboard.png` });
});
