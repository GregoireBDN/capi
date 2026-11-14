// Deliberately unsafe code seeded to check the #101 Semgrep job.
// Throwaway branch, deleted after the check.
export function run(input: string): unknown {
  return eval(input)
}
