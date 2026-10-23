// Only fill blank fields. Late profile responses must not overwrite typing.
export function mergeSignupDefaults(form,profile,fallbackName='',touched=new Set()){
 return {...form,name:touched.has('name')?form.name:form.name||profile.name||fallbackName,platformName:touched.has('platformName')?form.platformName:form.platformName||profile.platformName||'',qq:touched.has('qq')?form.qq:form.qq||profile.qq||''};
}
export function mergeSavedSignupProfile(form,profile,touched){return Object.fromEntries(['name','platformName','qq'].map(key=>[key,touched.has(key)?form[key]:profile[key]]));}
