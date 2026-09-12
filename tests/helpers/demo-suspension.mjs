// Use the existing dialog suspension behavior to isolate scene animations in
// browser fixtures. This adds no pause control or testing API to the product.
export async function toggleDemoSuspension(page) {
  await page.evaluate(() => {
    const existing = document.querySelector('[data-test-demo-suspension]');
    if (existing) { existing.remove(); return; }
    const dialog = document.createElement('dialog');
    dialog.dataset.testDemoSuspension = '';
    dialog.open = true;
    dialog.hidden = true;
    document.body.append(dialog);
  });
}
