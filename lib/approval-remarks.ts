export function collectDecisionRemarks(action: string): string | null {
  const value = window.prompt(`Enter remarks to ${action} this request (at least five characters).`);
  const remarks = value?.trim() ?? '';
  return remarks.length >= 5 ? remarks : null;
}