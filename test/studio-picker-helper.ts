import type {Page} from 'playwright-core';

/** Exercise the visible control, including the same selection path as a pointer user. */
export async function selectStudioOption(page:Page,id:string,value:string){
 await page.locator(`#${id}-trigger`).click();
 await page.locator(`#${id}-listbox [role="option"][data-value=${JSON.stringify(value)}]`).click();
}
