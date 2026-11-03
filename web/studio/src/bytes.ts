export function decodeMarkdown(bytes:Uint8Array):string {try{return new TextDecoder('utf-8',{fatal:true,ignoreBOM:true}).decode(bytes);}catch{throw new Error('Markdown must be valid UTF-8');}}
export function markdownForSave(draft:{originalMarkdown:string;markdown:string;markdownChanged:boolean}):string{return draft.markdownChanged?draft.markdown:draft.originalMarkdown;}
export function base64(bytes:Uint8Array):string {let binary='';for(let offset=0;offset<bytes.length;offset+=8192)binary+=String.fromCharCode(...bytes.subarray(offset,offset+8192));return btoa(binary);}
