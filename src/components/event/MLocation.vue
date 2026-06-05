<template>
	<div class="w-full">
		<UFormField
			label="Location"
			name="location"
			:help="summaryAddress ? 'Tap to change' : 'Tap to search a place or enter coordinates'"
		>
			<IonButton
				expand="block"
				:color="hasSelection ? 'primary' : 'medium'"
				:fill="hasSelection ? 'solid' : 'outline'"
				class="w-full"
				@click="openModal"
			>
				<span class="flex items-center gap-2 w-full">
					<UIcon
						name="mdi:map-marker"
						class="size-5 shrink-0"
					/>
					<span class="text-left flex-1 truncate">
						{{ buttonLabel }}
					</span>
					<UIcon
						name="mdi:chevron-right"
						class="size-5 opacity-70 shrink-0"
					/>
				</span>
			</IonButton>

			<p
				v-if="hasSelection && summaryCoords"
				class="text-xs text-gray-500 mt-1 px-1"
			>
				{{ summaryCoords }}
			</p>
		</UFormField>

		<IonModal
			:is-open="isOpen"
			@didDismiss="onDismiss"
		>
			<IonHeader>
				<IonToolbar>
					<IonButtons slot="start">
						<IonButton @click="cancelAndClose">Cancel</IonButton>
					</IonButtons>
					<IonTitle>Pick Location</IonTitle>
					<IonButtons slot="end">
						<IonButton
							color="primary"
							:strong="true"
							:disabled="!draft"
							@click="confirmAndClose"
						>
							Save
						</IonButton>
					</IonButtons>
				</IonToolbar>
			</IonHeader>
			<IonContent class="ion-padding">
				<IonSearchbar
					ref="searchbarRef"
					v-model="searchTerm"
					placeholder="Search for a place..."
					:debounce="300"
					show-clear-button="focus"
					@ion-input="handleSearchChange"
					@ion-clear="clearSearch"
				/>

				<div
					v-if="loading"
					class="flex items-center justify-center py-6"
				>
					<IonSpinner name="crescent" />
				</div>

				<IonList
					v-else-if="results.length > 0"
					class="bg-transparent"
				>
					<IonItem
						v-for="item in results"
						:key="item.full_name"
						button
						lines="inset"
						:detail="false"
						@click="selectResult(item)"
					>
						<div class="flex flex-col py-1 min-w-0">
							<span class="text-sm font-medium truncate">{{ item.label }}</span>
							<span
								v-if="item.subtitle"
								class="text-xs text-gray-500 truncate"
								>{{ item.subtitle }}</span
							>
						</div>
						<UIcon
							v-if="draft && draft.full_name === item.full_name"
							slot="end"
							name="mdi:check-circle"
							class="size-5 text-primary"
						/>
					</IonItem>
				</IonList>

				<div
					v-else-if="searchAttempted && searchTerm.trim().length > 0"
					class="flex flex-col items-center justify-center py-8 gap-2 text-center"
				>
					<UIcon
						name="mdi:map-search-outline"
						class="size-10 text-gray-400"
					/>
					<p class="text-sm text-gray-500 m-0!">No matches for “{{ searchTerm.trim() }}”</p>
					<p class="text-xs text-gray-400 m-0!">
						Try a more general name, or enter coordinates below.
					</p>
				</div>

				<div
					v-else
					class="flex flex-col items-center justify-center py-8 gap-2 text-center"
				>
					<UIcon
						name="mdi:map-marker-radius-outline"
						class="size-10 text-gray-400"
					/>
					<p class="text-sm text-gray-500 m-0!">Start typing to search for a place.</p>
				</div>

				<div class="mt-6 border-t border-gray-700/30 pt-4">
					<IonButton
						expand="block"
						fill="clear"
						size="small"
						@click="manualOpen = !manualOpen"
					>
						<UIcon
							:name="manualOpen ? 'mdi:chevron-up' : 'mdi:chevron-down'"
							class="size-4 mr-1"
						/>
						{{ manualOpen ? 'Hide coordinates' : 'Enter coordinates instead' }}
					</IonButton>

					<div
						v-if="manualOpen"
						class="flex flex-col gap-2 mt-2"
					>
						<IonInput
							v-model="coordinatesInput"
							label="Coordinates"
							label-placement="stacked"
							fill="solid"
							placeholder="e.g. 40.7128, -74.0060"
							@ion-input="handleCoordinatesChange"
							:color="coordinatesValid === false ? 'danger' : undefined"
						/>
						<p
							v-if="coordinatesValid === false"
							class="text-xs text-red-500 m-0!"
						>
							Invalid format. Use: latitude, longitude
						</p>
						<IonButton
							:disabled="coordinatesValid !== true"
							size="small"
							fill="outline"
							@click="applyManualCoordinates"
						>
							Use these coordinates
						</IonButton>
					</div>
				</div>
			</IonContent>
		</IonModal>
	</div>
</template>

<script setup lang="ts">
import { Toast } from '@capacitor/toast';

const props = defineProps<{
	modelValue: {
		latitude: number;
		longitude: number;
	} | null;
	fields?: Record<string, any>;
}>();

const emit = defineEmits<{
	'update:modelValue': [value: { latitude: number; longitude: number } | null];
	'update:fields': [value: Record<string, any>];
}>();

const {
	autocomplete,
	geocode,
	reverseGeocode: reverseGeocodeFromComposable
} = useGeocoding(makeMServerRequest);
const { selection: hapticSelection, notifyError } = useAppHaptics();

type LocationItem = {
	label: string;
	subtitle?: string;
	full_name: string;
	types: string[];
	address?: string;
};

const session = crypto.randomUUID();
const isOpen = ref(false);
const searchbarRef = ref<any>(null);

const searchTerm = ref('');
const results = ref<LocationItem[]>([]);
const loading = ref(false);
const searchAttempted = ref(false);

// staged selection inside the modal until user hits Save — prevents accidental writes when canceling
const draft = ref<{
	latitude: number;
	longitude: number;
	address: string;
	full_name: string;
} | null>(null);

const manualOpen = ref(false);
const coordinatesInput = ref('');
const coordinatesValid = ref<boolean | null>(null);

const hasSelection = computed(() => Boolean(props.modelValue));
const summaryAddress = computed(() => props.fields?.['address'] as string | undefined);
const summaryCoords = computed(() => {
	const v = props.modelValue;
	if (!v) return '';
	return `${v.latitude.toFixed(5)}, ${v.longitude.toFixed(5)}`;
});

const buttonLabel = computed(() => {
	if (summaryAddress.value) return summaryAddress.value;
	if (props.modelValue) return summaryCoords.value;
	return 'Select Location';
});

function formatDistance(meters: number | undefined): string | undefined {
	if (meters === undefined) return undefined;
	if (meters < 1000) return `${Math.round(meters)}m away`;
	return `${(meters / 1000).toFixed(1)}km away`;
}

function openModal() {
	hapticSelection();
	// pre-seed draft with existing value so Save is meaningful when user just opened to browse
	if (props.modelValue) {
		draft.value = {
			latitude: props.modelValue.latitude,
			longitude: props.modelValue.longitude,
			address: summaryAddress.value || '',
			full_name: summaryAddress.value || ''
		};
		coordinatesInput.value = summaryCoords.value;
		coordinatesValid.value = true;
	} else {
		draft.value = null;
		coordinatesInput.value = '';
		coordinatesValid.value = null;
	}
	searchTerm.value = '';
	results.value = [];
	searchAttempted.value = false;
	manualOpen.value = false;
	isOpen.value = true;
	void nextTick(() => {
		searchbarRef.value?.$el?.setFocus?.();
	});
}

function onDismiss() {
	isOpen.value = false;
	loading.value = false;
	abortInFlight();
}

function cancelAndClose() {
	isOpen.value = false;
}

function confirmAndClose() {
	if (!draft.value) {
		isOpen.value = false;
		return;
	}
	emit('update:modelValue', {
		latitude: draft.value.latitude,
		longitude: draft.value.longitude
	});
	const updatedFields = { ...(props.fields || {}) };
	updatedFields['address'] = draft.value.address || draft.value.full_name;
	emit('update:fields', updatedFields);
	isOpen.value = false;
}

// race-control: latest search wins. counter + abort guards stale responses + cancels in-flight fetches
let searchGeneration = 0;
let inFlightAbort: AbortController | null = null;
function abortInFlight() {
	if (inFlightAbort) {
		inFlightAbort.abort();
		inFlightAbort = null;
	}
}

async function handleSearchChange(event: any) {
	const term = event.detail.value ?? '';
	searchTerm.value = term;

	if (!term || term.trim().length < 2) {
		results.value = [];
		searchAttempted.value = false;
		abortInFlight();
		return;
	}

	await performSearch(term);
}

function clearSearch() {
	searchTerm.value = '';
	results.value = [];
	searchAttempted.value = false;
	abortInFlight();
}

async function performSearch(term: string) {
	abortInFlight();
	const gen = ++searchGeneration;
	loading.value = true;
	searchAttempted.value = true;

	try {
		const res = await autocomplete(term, session);
		if (gen !== searchGeneration) return; // stale

		if (res.success && 'data' in res && res.data) {
			const suggestions = res.data as EventAutocompleteSuggestion[];
			results.value = suggestions.map((s) => ({
				label: s.name,
				subtitle: s.address || formatDistance(s.distance_meters),
				full_name: s.full_name,
				types: s.types || [],
				address: s.address
			}));
		} else {
			results.value = [];
		}
	} catch (error) {
		if (gen !== searchGeneration) return;
		console.error('Autocomplete error:', error);
		results.value = [];
	} finally {
		if (gen === searchGeneration) {
			loading.value = false;
		}
	}
}

async function selectResult(item: LocationItem) {
	hapticSelection();
	loading.value = true;
	try {
		const res = await geocode(item.full_name);
		if (valid(res)) {
			draft.value = {
				latitude: res.data.latitude,
				longitude: res.data.longitude,
				address: item.address || item.full_name,
				full_name: item.full_name
			};
			coordinatesInput.value = `${res.data.latitude}, ${res.data.longitude}`;
			coordinatesValid.value = true;
		} else {
			notifyError();
			await Toast.show({
				text: res.message || 'Could not resolve that location.',
				duration: 'short'
			});
		}
	} finally {
		loading.value = false;
	}
}

function handleCoordinatesChange(event: any) {
	const value = event.target.value;
	if (!value || value.trim() === '') {
		coordinatesValid.value = null;
		return;
	}
	const cleaned = value.replace(/\s/g, '');
	const parts = cleaned.split(',');
	if (parts.length !== 2 || !parts[0] || !parts[1]) {
		coordinatesValid.value = false;
		return;
	}
	const lat = parseFloat(parts[0]);
	const lng = parseFloat(parts[1]);
	if (
		!Number.isFinite(lat) ||
		!Number.isFinite(lng) ||
		lat < -90 ||
		lat > 90 ||
		lng < -180 ||
		lng > 180
	) {
		coordinatesValid.value = false;
		return;
	}
	coordinatesValid.value = true;
}

async function applyManualCoordinates() {
	if (coordinatesValid.value !== true) return;
	const cleaned = coordinatesInput.value.replace(/\s/g, '');
	const [latStr, lngStr] = cleaned.split(',');
	const lat = parseFloat(latStr!);
	const lng = parseFloat(lngStr!);
	if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;

	// best-effort reverse geocode for address; fall back to the bare coordinate string
	let address = `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
	const res = await reverseGeocodeFromComposable(lat, lng);
	if (res.success && 'data' in res && res.data?.address) {
		address = res.data.address;
	}

	draft.value = {
		latitude: lat,
		longitude: lng,
		address,
		full_name: address
	};
}
</script>
