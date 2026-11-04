import type {Page} from 'playwright-core';
/** Resolve the visible application confirmation; native unload dialogs are unrelated. */
export async function chooseStudioDialog(page:Page,choice:'confirm'|'cancel'='confirm'){
 const dialog=page.getByRole('alertdialog');await dialog.waitFor();await dialog.locator(`[data-dialog-choice="${choice}"]`).click();await dialog.waitFor({state:'detached'});
}
