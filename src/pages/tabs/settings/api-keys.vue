<template>
	<IonPage>
		<IonHeader class="ion-no-border">
			<IonToolbar>
				<IonButtons slot="start">
					<IonBackButton default-href="/tabs/settings" />
				</IonButtons>
				<IonTitle>API Keys</IonTitle>
				<IonButtons slot="end">
					<IonButton
						color="primary"
						:disabled="atLimit || !emailVerified"
						@click="openCreate"
					>
						<UIcon
							name="mdi:plus"
							class="size-5"
						/>
					</IonButton>
				</IonButtons>
			</IonToolbar>
		</IonHeader>

		<IonContent :scroll-y="true">
			<div class="flex flex-col w-full px-4 pb-8 max-w-3xl mx-auto">
				<p class="text-sm opacity-80 text-center mt-4 mb-4">
					API keys let scripts and third-party tools act on your behalf, scoped to the permissions
					you grant. Tokens are shown once — copy them immediately. Revoke any key at any time.
				</p>

				<div
					v-if="!user"
					class="text-center py-12 opacity-70"
				>
					You must be signed in to manage API keys.
				</div>

				<template v-else>
					<div
						v-if="!emailVerified"
						class="rounded bg-amber-500/10 border border-amber-500/40 p-3 mb-3 flex items-start gap-2"
					>
						<UIcon
							name="mdi:alert"
							class="text-amber-500 text-lg shrink-0 mt-0.5"
						/>
						<div class="text-xs">
							You need a verified email address before you can generate API keys.
						</div>
					</div>

					<div
						v-if="atLimit"
						class="rounded bg-amber-500/10 border border-amber-500/40 p-3 mb-3 text-xs"
					>
						You've reached the maximum number of active keys for your tier ({{ max }}). Revoke one
						before creating another.
					</div>

					<div class="flex items-center justify-between mb-2">
						<div class="text-xs opacity-80">
							<span class="font-semibold">{{ active }}</span> active
							<span v-if="Number.isFinite(max)">
								/ {{ max >= Number.MAX_SAFE_INTEGER ? '∞' : max }} allowed
							</span>
						</div>
						<IonButton
							v-if="keys.length > 0"
							size="small"
							fill="clear"
							color="danger"
							:disabled="busy"
							@click="onRevokeAll"
						>
							Revoke All
						</IonButton>
					</div>

					<div
						v-if="loadingPage"
						class="flex items-center justify-center w-full py-12"
					>
						<IonSpinner name="crescent" />
					</div>

					<div
						v-else-if="keys.length === 0"
						class="w-full rounded-xl border border-black/20 light:border-gray-300 px-6 py-10 text-center"
					>
						<h2 class="text-base! font-semibold m-0! mb-2!">No API Keys Yet</h2>
						<p class="text-sm opacity-80 m-0!">
							Tap the + in the header to generate your first key.
						</p>
					</div>

					<IonList
						v-else
						class="w-full rounded-xl border-2 border-black/40 light:border-gray-300"
					>
						<IonItem
							v-for="key in keys"
							:key="key.id"
							:class="{ 'opacity-60': key.revoked || key.expired }"
						>
							<div class="flex flex-col w-full my-2 gap-1">
								<div class="flex items-center justify-between gap-2">
									<div class="font-semibold truncate">{{ key.name }}</div>
									<div class="flex items-center gap-1 shrink-0">
										<UIcon
											v-if="key.revoked"
											name="mdi:shield-off"
											class="text-red-500"
										/>
										<UIcon
											v-else-if="key.expired"
											name="mdi:timer-off"
											class="text-red-500"
										/>
										<UIcon
											v-else-if="key.never_expires"
											name="mdi:infinity"
											class="text-amber-500"
										/>
										<UIcon
											v-else
											name="mdi:check-circle"
											class="text-green-500"
										/>
									</div>
								</div>

								<code class="font-mono text-xs opacity-80">{{ key.token_prefix }}…</code>

								<div
									v-if="key.description"
									class="text-xs opacity-80"
								>
									{{ key.description }}
								</div>

								<div class="flex flex-wrap gap-1 mt-1">
									<span
										v-for="scope in key.scopes"
										:key="scope"
										class="font-mono text-[10px] rounded bg-default/40 border border-default/60 px-1.5 py-0.5"
									>
										{{ scope }}
									</span>
								</div>

								<div class="text-[11px] opacity-70 flex flex-wrap gap-x-3 gap-y-0.5 mt-1">
									<span>Created {{ relative(key.created_at) }}</span>
									<span v-if="key.last_used_at">Last used {{ relative(key.last_used_at) }}</span>
									<span
										v-else
										class="italic"
										>Never used</span
									>
									<span v-if="key.never_expires">Never expires</span>
									<span v-else-if="key.expires_at">
										{{ key.expired ? 'Expired' : 'Expires' }}
										{{ relative(key.expires_at) }}
									</span>
									<span v-if="key.revoked && key.revoked_at"
										>Revoked {{ relative(key.revoked_at) }}</span
									>
								</div>

								<div
									v-if="!key.revoked"
									class="flex justify-end gap-1 mt-1"
								>
									<IonButton
										v-if="!key.expired"
										size="small"
										fill="clear"
										color="secondary"
										:disabled="busy"
										@click="openEdit(key)"
									>
										Edit
									</IonButton>
									<IonButton
										size="small"
										fill="clear"
										color="danger"
										:disabled="busy"
										@click="onRevoke(key)"
									>
										Revoke
									</IonButton>
								</div>
							</div>
						</IonItem>
					</IonList>
				</template>
			</div>
		</IonContent>

		<!-- create modal -->
		<IonModal
			:is-open="createOpen"
			@did-dismiss="closeCreate"
		>
			<IonHeader>
				<IonToolbar>
					<IonTitle>Generate API Key</IonTitle>
					<IonButtons slot="end">
						<IonButton
							color="medium"
							:disabled="submitting"
							@click="closeCreate"
						>
							Cancel
						</IonButton>
					</IonButtons>
				</IonToolbar>
			</IonHeader>
			<IonContent>
				<div class="flex flex-col gap-3 p-4">
					<IonItem>
						<IonInput
							v-model="createForm.name"
							label="Name"
							label-placement="floating"
							placeholder="e.g. CI deploy bot"
							:maxlength="catalog?.name.max ?? 64"
						/>
					</IonItem>

					<IonItem>
						<IonTextarea
							v-model="createForm.description"
							label="Description (Optional)"
							label-placement="floating"
							:maxlength="catalog?.description.max ?? 512"
							:rows="2"
						/>
					</IonItem>

					<IonItem>
						<IonSelect
							v-model="createForm.expiryPreset"
							label="Expiration"
							label-placement="floating"
							interface="popover"
						>
							<IonSelectOption
								v-for="opt in expiryOptions"
								:key="opt.value"
								:value="opt.value"
								>{{ opt.label }}</IonSelectOption
							>
						</IonSelect>
					</IonItem>

					<IonItem v-if="createForm.expiryPreset === 'custom'">
						<IonInput
							v-model="customDateInput"
							type="date"
							label="Expiry Date"
							label-placement="floating"
							:min="minDateInput"
						/>
					</IonItem>

					<div
						v-if="createForm.expiryPreset === 'never'"
						class="rounded bg-amber-500/10 border border-amber-500/40 p-2 flex items-start gap-2 text-xs"
					>
						<UIcon
							name="mdi:alert"
							class="text-amber-500 text-base shrink-0 mt-0.5"
						/>
						<div>
							No-expiration keys remain valid until you revoke them. Anyone with this token can act
							on your behalf indefinitely. Prefer a finite expiration.
						</div>
					</div>

					<div class="flex flex-col gap-1">
						<div class="text-sm font-medium">Permissions</div>
						<div
							v-if="!catalog"
							class="text-xs opacity-70"
						>
							Loading scopes…
						</div>
						<div
							v-else
							class="flex flex-col gap-2"
						>
							<details
								v-for="(node, name) in catalog.scopes"
								:key="name"
								class="rounded border border-default/60 p-2"
							>
								<summary class="flex items-center gap-2 cursor-pointer">
									<IonCheckbox
										:checked="isChecked(String(name))"
										@ion-change="toggle(String(name), $event)"
										@click.stop
									/>
									<div class="flex flex-col">
										<div class="font-mono text-xs font-semibold">{{ name }}</div>
										<div class="text-[11px] opacity-80">{{ node.description }}</div>
									</div>
								</summary>
								<div
									v-if="node.children"
									class="pl-4 mt-2 flex flex-col gap-1 border-l border-default/60"
								>
									<label
										v-for="(child, childName) in node.children"
										:key="childName"
										class="flex items-start gap-2 cursor-pointer"
									>
										<IonCheckbox
											:checked="isChecked(String(childName)) || isChecked(String(name))"
											:disabled="isChecked(String(name))"
											@ion-change="toggle(String(childName), $event)"
										/>
										<div class="flex flex-col">
											<div class="font-mono text-[11px] font-semibold">
												{{ childName }}
											</div>
											<div class="text-[11px] opacity-80">{{ child.description }}</div>
										</div>
									</label>
								</div>
							</details>
						</div>
						<div
							v-if="createForm.scopes.length === 0"
							class="text-[11px] text-red-500"
						>
							Select at least one permission.
						</div>
						<div
							v-else
							class="text-[11px] opacity-70"
						>
							{{ createForm.scopes.length }} scope{{ createForm.scopes.length === 1 ? '' : 's' }}
							selected.
						</div>
					</div>

					<IonButton
						color="primary"
						:disabled="!canSubmitCreate || submitting"
						@click="submitCreate"
					>
						<IonSpinner
							v-if="submitting"
							name="crescent"
						/>
						<span v-else>Generate Key</span>
					</IonButton>
				</div>
			</IonContent>
		</IonModal>

		<!-- edit modal -->
		<IonModal
			:is-open="editOpen"
			@did-dismiss="closeEdit"
		>
			<IonHeader>
				<IonToolbar>
					<IonTitle>Edit API Key</IonTitle>
					<IonButtons slot="end">
						<IonButton
							color="medium"
							:disabled="submitting"
							@click="closeEdit"
						>
							Cancel
						</IonButton>
					</IonButtons>
				</IonToolbar>
			</IonHeader>
			<IonContent v-if="editing">
				<div class="flex flex-col gap-3 p-4">
					<IonItem>
						<IonInput
							v-model="editForm.name"
							label="Name"
							label-placement="floating"
							:maxlength="catalog?.name.max ?? 64"
						/>
					</IonItem>

					<IonItem>
						<IonTextarea
							v-model="editForm.description"
							label="Description (Optional)"
							label-placement="floating"
							:maxlength="catalog?.description.max ?? 512"
							:rows="2"
						/>
					</IonItem>

					<div
						class="rounded bg-default/40 border border-default/60 p-2 flex items-center gap-2 text-xs opacity-80"
					>
						<UIcon name="mdi:information-outline" />
						Expiration cannot be changed in place. Generate a replacement and revoke this one if you
						need to extend it.
					</div>

					<div class="flex flex-col gap-1">
						<div class="text-sm font-medium">Permissions</div>
						<div
							v-if="catalog"
							class="flex flex-col gap-2"
						>
							<details
								v-for="(node, name) in catalog.scopes"
								:key="name"
								class="rounded border border-default/60 p-2"
							>
								<summary class="flex items-center gap-2 cursor-pointer">
									<IonCheckbox
										:checked="isCheckedEdit(String(name))"
										@ion-change="toggleEdit(String(name), $event)"
										@click.stop
									/>
									<div class="flex flex-col">
										<div class="font-mono text-xs font-semibold">{{ name }}</div>
										<div class="text-[11px] opacity-80">{{ node.description }}</div>
									</div>
								</summary>
								<div
									v-if="node.children"
									class="pl-4 mt-2 flex flex-col gap-1 border-l border-default/60"
								>
									<label
										v-for="(child, childName) in node.children"
										:key="childName"
										class="flex items-start gap-2 cursor-pointer"
									>
										<IonCheckbox
											:checked="isCheckedEdit(String(childName)) || isCheckedEdit(String(name))"
											:disabled="isCheckedEdit(String(name))"
											@ion-change="toggleEdit(String(childName), $event)"
										/>
										<div class="flex flex-col">
											<div class="font-mono text-[11px] font-semibold">
												{{ childName }}
											</div>
											<div class="text-[11px] opacity-80">{{ child.description }}</div>
										</div>
									</label>
								</div>
							</details>
						</div>
					</div>

					<IonButton
						color="primary"
						:disabled="!canSubmitEdit || submitting"
						@click="submitEdit"
					>
						<IonSpinner
							v-if="submitting"
							name="crescent"
						/>
						<span v-else>Save Changes</span>
					</IonButton>
				</div>
			</IonContent>
		</IonModal>

		<!-- reveal modal: one-time token display -->
		<IonModal
			:is-open="revealOpen"
			:backdrop-dismiss="acknowledged"
			@did-dismiss="onRevealDismiss"
		>
			<IonHeader>
				<IonToolbar>
					<IonTitle>Save Your API Key</IonTitle>
					<IonButtons slot="end">
						<IonButton
							color="primary"
							:disabled="!acknowledged"
							@click="closeReveal"
						>
							Done
						</IonButton>
					</IonButtons>
				</IonToolbar>
			</IonHeader>
			<IonContent v-if="created">
				<div class="flex flex-col gap-3 p-4">
					<div
						class="flex items-start gap-2 rounded bg-amber-500/10 border border-amber-500/40 p-3"
					>
						<UIcon
							name="mdi:alert"
							class="text-amber-500 text-2xl shrink-0"
						/>
						<div class="text-sm">
							<div class="font-semibold">This is the only time you'll see this token.</div>
							<div class="opacity-80">
								Copy it now and store it somewhere secure. The Earth App stores only a hash — we
								can't show it again, and we can't recover it.
							</div>
						</div>
					</div>

					<div class="flex flex-col gap-1">
						<div class="text-sm font-medium">{{ created.name }}</div>
						<div
							v-if="created.description"
							class="text-xs opacity-80"
						>
							{{ created.description }}
						</div>
						<div
							v-if="created.never_expires"
							class="text-xs text-amber-500"
						>
							This key never expires.
						</div>
						<div
							v-else-if="created.expires_at"
							class="text-xs opacity-80"
						>
							Expires {{ new Date(created.expires_at).toLocaleString() }}.
						</div>
					</div>

					<div class="flex flex-col gap-1">
						<div class="text-xs font-medium opacity-80">Bearer Token</div>
						<div
							class="font-mono text-xs break-all rounded border border-default px-2 py-2 bg-default/40 select-all"
						>
							{{ created.token }}
						</div>
						<IonButton
							color="secondary"
							expand="block"
							@click="copyToken"
						>
							<UIcon
								name="mdi:content-copy"
								class="mr-2"
							/>
							Copy Token
						</IonButton>
					</div>

					<label class="flex items-start gap-2 cursor-pointer">
						<IonCheckbox v-model="acknowledged" />
						<div class="text-sm">I've saved my key somewhere safe.</div>
					</label>
				</div>
			</IonContent>
		</IonModal>
	</IonPage>
</template>

<script setup lang="ts">
import { Dialog } from '@capacitor/dialog';
import type { ApiKey, ApiKeyCreated, ApiKeyExpiryPresetKey, ApiKeyScopeId } from 'types/apiKeys';
import { showErrorToast, showInfoToast } from '~/composables/useNotify';

const { user, fetchUser } = useAuth();
const {
	keys,
	active,
	max,
	fetchKeys,
	fetchCatalog,
	catalog,
	createKey,
	updateKey,
	revokeKey,
	revokeAllKeys
} = useApiKeys();

const loadingPage = ref(true);
const busy = ref(false);
const submitting = ref(false);

const emailVerified = computed(() => !!user.value?.account?.email_verified);
const atLimit = computed(() => max.value !== Number.MAX_SAFE_INTEGER && active.value >= max.value);

// create flow state
interface CreateForm {
	name: string;
	description: string;
	scopes: ApiKeyScopeId[];
	expiryPreset: ApiKeyExpiryPresetKey | 'custom';
}
const createOpen = ref(false);
const createForm = ref<CreateForm>(blankCreateForm());
const customDateInput = ref('');

// edit flow state
interface EditForm {
	name: string;
	description: string;
	scopes: ApiKeyScopeId[];
}
const editOpen = ref(false);
const editing = ref<ApiKey | null>(null);
const editForm = ref<EditForm>({ name: '', description: '', scopes: [] });

// reveal flow state
const revealOpen = ref(false);
const created = ref<ApiKeyCreated | null>(null);
const acknowledged = ref(false);

function blankCreateForm(): CreateForm {
	return { name: '', description: '', scopes: [], expiryPreset: '30d' };
}

const minDateInput = computed(() => {
	const d = new Date();
	d.setDate(d.getDate() + 1);
	return d.toISOString().slice(0, 10);
});

const expiryOptions = computed(() => {
	const presets = catalog.value?.expiry_presets ?? {};
	const items: { label: string; value: CreateForm['expiryPreset'] }[] = [];
	for (const [k, v] of Object.entries(presets)) {
		items.push({ label: `${v.days} Days`, value: k as ApiKeyExpiryPresetKey });
	}
	items.push({ label: 'Custom Date…', value: 'custom' });
	items.push({ label: 'Never Expires (Warning)', value: 'never' });
	return items;
});

const canSubmitCreate = computed(() => {
	const n = createForm.value.name.trim();
	if (n.length < (catalog.value?.name.min ?? 3) || n.length > (catalog.value?.name.max ?? 64)) {
		return false;
	}
	if (createForm.value.scopes.length === 0) return false;
	if (createForm.value.expiryPreset === 'custom' && !customDateInput.value) return false;
	return true;
});

const canSubmitEdit = computed(() => {
	if (!editing.value) return false;
	const n = editForm.value.name.trim();
	if (n.length < (catalog.value?.name.min ?? 3) || n.length > (catalog.value?.name.max ?? 64)) {
		return false;
	}
	if (editForm.value.scopes.length === 0) return false;
	return true;
});

function isChecked(scope: string) {
	return createForm.value.scopes.includes(scope);
}

function toggle(scope: string, ev: any) {
	const checked = ev?.detail?.checked ?? ev?.target?.checked;
	const next = new Set(createForm.value.scopes);
	if (checked) next.add(scope);
	else next.delete(scope);
	createForm.value.scopes = [...next];
}

function isCheckedEdit(scope: string) {
	return editForm.value.scopes.includes(scope);
}

function toggleEdit(scope: string, ev: any) {
	const checked = ev?.detail?.checked ?? ev?.target?.checked;
	const next = new Set(editForm.value.scopes);
	if (checked) next.add(scope);
	else next.delete(scope);
	editForm.value.scopes = [...next];
}

function openCreate() {
	createForm.value = blankCreateForm();
	customDateInput.value = '';
	createOpen.value = true;
}

function closeCreate() {
	if (submitting.value) return;
	createOpen.value = false;
}

function openEdit(key: ApiKey) {
	editing.value = key;
	editForm.value = {
		name: key.name,
		description: key.description ?? '',
		scopes: [...key.scopes]
	};
	editOpen.value = true;
}

function closeEdit() {
	if (submitting.value) return;
	editOpen.value = false;
	editing.value = null;
}

function closeReveal() {
	if (!acknowledged.value) {
		void showInfoToast(
			'Copy the token first, then tick the confirmation. This is the only time you can see it.'
		);
		return;
	}
	revealOpen.value = false;
}

function onRevealDismiss() {
	// only fires when iOS swipe-down or backdrop close — gate is enforced by
	// backdrop-dismiss=acknowledged but be defensive
	if (!acknowledged.value) {
		void showInfoToast('Copy the token first so it isn’t lost.');
		revealOpen.value = true;
		return;
	}
	created.value = null;
	acknowledged.value = false;
}

async function submitCreate() {
	if (!canSubmitCreate.value) return;
	submitting.value = true;
	try {
		const input = {
			name: createForm.value.name.trim(),
			description: createForm.value.description.trim() || null,
			scopes: createForm.value.scopes,
			expiry_preset:
				createForm.value.expiryPreset === 'custom' ? undefined : createForm.value.expiryPreset,
			expires_at:
				createForm.value.expiryPreset === 'custom'
					? Math.floor(new Date(customDateInput.value).getTime() / 1000)
					: undefined
		};
		const res = await createKey(input);
		if (res.success && res.data) {
			created.value = res.data;
			acknowledged.value = false;
			createOpen.value = false;
			revealOpen.value = true;
			void showInfoToast(`Generated "${res.data.name}". Copy the token now.`);
		} else {
			await showErrorToast(res.error, {
				fallback: 'Could not generate the API key. Check the name, scopes, and tier limit.'
			});
		}
	} finally {
		submitting.value = false;
	}
}

async function submitEdit() {
	if (!canSubmitEdit.value || !editing.value) return;
	submitting.value = true;
	try {
		const res = await updateKey(editing.value.id, {
			name: editForm.value.name.trim(),
			description: editForm.value.description.trim() || null,
			scopes: editForm.value.scopes
		});
		if (res.success && res.data) {
			editOpen.value = false;
			editing.value = null;
			void showInfoToast(
				`Updated "${res.data.name}". Active tokens pick up new permissions on the next request.`
			);
		} else {
			await showErrorToast(res.error, {
				fallback: 'Could not update the key. Revoked keys cannot be edited.'
			});
		}
	} finally {
		submitting.value = false;
	}
}

async function onRevoke(key: ApiKey) {
	const { value } = await Dialog.confirm({
		title: 'Revoke API Key',
		message: `Revoke "${key.name}"? Scripts using this token will start receiving 401 responses. This cannot be undone.`,
		okButtonTitle: 'Revoke',
		cancelButtonTitle: 'Cancel'
	});
	if (!value) return;

	busy.value = true;
	try {
		const res = await revokeKey(key.id);
		if (res.success) {
			void showInfoToast(`"${key.name}" revoked. It can no longer authenticate requests.`);
		} else {
			await showErrorToast(res.error, { fallback: 'Could not revoke the key.' });
		}
	} finally {
		busy.value = false;
	}
}

async function onRevokeAll() {
	const { value } = await Dialog.confirm({
		title: 'Revoke All Keys',
		message:
			'Revoke every active API key? Every script using one of your tokens will start receiving 401 responses. This cannot be undone.',
		okButtonTitle: 'Revoke All',
		cancelButtonTitle: 'Cancel'
	});
	if (!value) return;

	busy.value = true;
	try {
		const res = await revokeAllKeys();
		if (res.success) {
			const n = res.data?.revoked ?? 0;
			void showInfoToast(
				n > 0
					? `Revoked ${n} API key${n === 1 ? '' : 's'}.`
					: 'There were no active keys to revoke.'
			);
		} else {
			await showErrorToast(res.error, { fallback: 'Could not revoke keys.' });
		}
	} finally {
		busy.value = false;
	}
}

async function copyToken() {
	if (!created.value?.token) return;
	try {
		// capacitor's webview honors navigator.clipboard on both iOS and android
		// so we don't need the optional @capacitor/clipboard plugin here
		await navigator.clipboard.writeText(created.value.token);
		acknowledged.value = true;
		void showInfoToast('Token copied. Paste it into your script or secret manager now.');
	} catch {
		await showErrorToast(null, {
			fallback: 'Clipboard access was blocked. Select the token text manually and copy it.'
		});
	}
}

function relative(iso: string | null): string {
	if (!iso) return '—';
	const t = new Date(iso).getTime();
	if (Number.isNaN(t)) return iso;
	const diffMs = t - Date.now();
	const absSec = Math.abs(diffMs) / 1000;
	const past = diffMs < 0;
	const fmt = (n: number, unit: string) =>
		`${past ? '' : 'in '}${Math.round(n)} ${unit}${Math.round(n) === 1 ? '' : 's'}${past ? ' ago' : ''}`;
	if (absSec < 60) return past ? 'just now' : 'in <1 min';
	if (absSec < 3600) return fmt(absSec / 60, 'min');
	if (absSec < 86400) return fmt(absSec / 3600, 'hour');
	if (absSec < 86400 * 30) return fmt(absSec / 86400, 'day');
	if (absSec < 86400 * 365) return fmt(absSec / (86400 * 30), 'month');
	return fmt(absSec / (86400 * 365), 'year');
}

onMounted(async () => {
	try {
		await fetchUser();
		await Promise.all([fetchKeys(), fetchCatalog()]);
	} finally {
		loadingPage.value = false;
	}
});
</script>
