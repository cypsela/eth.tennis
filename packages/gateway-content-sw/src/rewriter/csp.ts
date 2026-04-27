export function addInlineScriptHash(policy: string, sha256: string): string {
  const hashTok = `'sha256-${sha256}'`;
  if (policy.includes(hashTok)) return policy.trim().replace(/\s*;\s*$/, "");

  const directives = policy.split(";").map((d) => d.trim()).filter(Boolean);

  const idx = directives.findIndex((d) => /^script-src(\s|$)/.test(d));
  if (idx === -1) {
    directives.push(`script-src ${hashTok}`);
  } else {
    directives[idx] = `${directives[idx]} ${hashTok}`;
  }
  return directives.join("; ");
}
