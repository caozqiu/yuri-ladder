// Only fill blank fields. Late profile responses must not overwrite typing.
export function mergeSignupDefaults(form,profile,fallbackName=''){
 return {...form,name:form.name||profile.name||fallbackName,platformName:form.platformName||profile.platformName||'',qq:form.qq||profile.qq||''};
}
