export function sanitizeFilename(name: string): string {
	return name.replace(/[^a-zA-Z0-9._-]/g, '_');
}

export function stripExtension(name: string): string {
	const index = name.lastIndexOf('.');
	return index <= 0 ? name : name.slice(0, index);
}

export function encodeRFC5987Value(value: string): string {
	return encodeURIComponent(value)
		.replace(/['()]/g, escape)
		.replace(/\*/g, '%2A')
		.replace(/%(7C|60|5E)/g, (match) => match.toLowerCase());
}
