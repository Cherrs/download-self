export function createId(): string {
	return crypto.randomUUID();
}

export function createToken(): string {
	return crypto.randomUUID();
}
