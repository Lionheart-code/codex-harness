export function info(message: string): void {
  process.stdout.write(`${message}\n`);
}

export function error(message: string): void {
  process.stderr.write(`${message}\n`);
}

export function lines(messages: string[]): void {
  process.stdout.write(`${messages.join("\n")}\n`);
}
