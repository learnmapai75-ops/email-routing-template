function allowedSenders(value: string): Set<string> {
	return new Set(
		value
			.split(",")
			.map((sender) => sender.trim().toLowerCase())
			.filter(Boolean),
	);
}

function isSenderAllowed(from: string, senders: Set<string>): boolean {
	const normalized = from.trim().toLowerCase();
	// Authorization is explicit: wildcard tokens are not supported.
	if (senders.has(normalized)) {
		return true;
	}
	const parts = normalized.split("@");
	const domain = parts[1];
	if (domain && (senders.has(domain) || senders.has(`@${domain}`))) {
		return true;
	}
	return false;
}

function needsConfiguration(values: string[]): boolean {
	return values.some(
		(value) => !value.trim() || /\\b[a-z0-9.-]+\\.example\\b/i.test(value),
	);
}

async function renderSetupPage(request: Request, env: Env): Promise<Response> {
	const response = await env.ASSETS.fetch(request);
	if (!response.ok) {
		return response;
	}

	const sendersConfigured = allowedSenders(env.ALLOWED_SENDERS).size > 0;
	const showWarning = needsConfiguration([
		env.ROUTE_ADDRESS,
		env.FORWARD_TO,
		env.ALLOWED_SENDERS,
	]);

	return new HTMLRewriter()
		.on("#route-address", {
			element(element) {
				element.setInnerContent(env.ROUTE_ADDRESS);
			},
		})
		.on("#forward-to", {
			element(element) {
				element.setInnerContent(env.FORWARD_TO);
			},
		})
		.on("#allowed-senders-state", {
			element(element) {
				element.setInnerContent(
					sendersConfigured ? "Configured" : "Not configured",
				);
			},
			})
		.on("#configuration-warning", {
			element(element) {
				if (!showWarning) {
					element.remove();
				}
			},
		})
		.transform(response);
}

export async function handleEmail(
	message: ForwardableEmailMessage,
	env: Env,
): Promise<void> {
	const destination = env.FORWARD_TO.trim();
	const senders = allowedSenders(env.ALLOWED_SENDERS);

	if (!destination || senders.size === 0) {
		message.setReject("Email routing is not configured");
		return;
	}

	// Email Routing exposes the SMTP envelope sender as `message.from`.
	if (!isSenderAllowed(message.from, senders)) {
		message.setReject("Sender is not allowed");
		return;
	}

	await message.forward(destination);
}

export default {
	async fetch(request, env) {
		if (new URL(request.url).pathname === "/") {
			return renderSetupPage(request, env);
		}
		return env.ASSETS.fetch(request);
	},
	email: handleEmail,
} satisfies ExportedHandler<Env>;
