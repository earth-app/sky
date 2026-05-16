<template>
	<div class="w-full">
		<UFormField
			label="Location"
			name="location"
			help="Enter coordinates or search for a location"
		>
			<div class="flex flex-col gap-3">
				<IonInput
					label="Coordinates"
					label-placement="stacked"
					fill="solid"
					v-model="coordinatesInput"
					placeholder="e.g., 40.7128, -74.0060"
					@ion-input="handleCoordinatesChange"
					@ion-blur="handleCoordinatesBlur"
					:color="coordinatesValid === false ? 'error' : undefined"
					class="w-full"
				/>

				<div
					v-if="coordinatesValid === false"
					class="text-xs text-red-500"
				>
					Invalid coordinates format. Use: latitude, longitude
				</div>

				<IonSelect
					ref="selectRef"
					v-model="selection"
					:placeholder="loading ? 'Loading locations...' : 'Or select a searched location...'"
					:disabled="loading"
					interface="popover"
					:compare-with="compareSelections"
					class="w-full"
				>
					<IonSelectOption
						v-for="item in results"
						:key="item.full_name"
						:value="item"
					>
						<div class="flex items-center gap-2">
							<span>{{ item.label }}</span>
							<span
								v-if="item.subtitle"
								class="text-xs text-gray-500"
							>
								{{ item.subtitle }}
							</span>
						</div>
					</IonSelectOption>
				</IonSelect>

				<IonSearchbar
					v-model="searchTerm"
					placeholder="Search locations..."
					@ion-input="handleSearchChange"
					:debounce="300"
					class="ion-no-padding"
				/>
			</div>
		</UFormField>
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
	reverseGeocode: reverseGeocodeFromComposable,
	retrieveLocation
} = useGeocodingM();
const { selection: hapticSelection, notifyError } = useAppHaptics();

type LocationItem = {
	label: string;
	subtitle?: string;
	latitude: number;
	longitude: number;
	full_name: string;
	types: string[];
};

const selectRef = ref<any>(null);

const session = crypto.randomUUID();
const selection = ref<LocationItem | undefined>(undefined);
const results = ref<LocationItem[]>([]);
const loading = ref(false);
const searchTerm = ref('');

// Coordinates input
const coordinatesInput = ref('');
const coordinatesValid = ref<boolean | null>(null);

function formatDistance(meters: number | undefined): string | undefined {
	if (meters === undefined) return undefined;

	if (meters < 1000) {
		return `${Math.round(meters)}m away`;
	} else {
		return `${(meters / 1000).toFixed(1)}km away`;
	}
}

// Compare function for IonSelect
// Watch for results to auto-open select when search results are available
watch(results, async (newResults) => {
	if (newResults.length > 0 && selectRef.value) {
		// Small delay to ensure DOM is updated
		await nextTick();
		selectRef.value.open();
	}
});

function compareSelections(o1: LocationItem | null, o2: LocationItem | null): boolean {
	if (!o1 || !o2) return o1 === o2;
	return o1.full_name === o2.full_name;
}

// Initialize from modelValue
onMounted(() => {
	retrieveLocation();

	if (props.modelValue) {
		coordinatesInput.value = `${props.modelValue.latitude}, ${props.modelValue.longitude}`;
		coordinatesValid.value = true;

		// Reverse geocode to get address
		reverseGeocode(props.modelValue.latitude, props.modelValue.longitude);
	}
});

// Watch for external changes to modelValue
watch(
	() => props.modelValue,
	(newValue) => {
		if (newValue && !selection.value) {
			coordinatesInput.value = `${newValue.latitude}, ${newValue.longitude}`;
			coordinatesValid.value = true;
		}
	},
	{ deep: true }
);

// Handle coordinates input change (validation only)
function handleCoordinatesChange(event: any) {
	const value = event.target.value;
	if (!value || value.trim() === '') {
		coordinatesValid.value = null;
		return;
	}

	// Remove all spaces and split by comma
	const cleaned = value.replace(/\s/g, '');
	const parts = cleaned.split(',');

	if (parts.length !== 2 || !parts[0] || !parts[1]) {
		coordinatesValid.value = false;
		return;
	}

	const lat = parseFloat(parts[0]);
	const lng = parseFloat(parts[1]);

	if (isNaN(lat) || isNaN(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
		coordinatesValid.value = false;
		return;
	}

	coordinatesValid.value = true;
}

// Handle coordinates blur (update only when valid and unfocused)
async function handleCoordinatesBlur() {
	if (coordinatesValid.value !== true) {
		return;
	}

	const value = coordinatesInput.value;
	if (!value || value.trim() === '') {
		return;
	}

	// Remove all spaces and split by comma
	const cleaned = value.replace(/\s/g, '');
	const parts = cleaned.split(',');

	if (parts.length !== 2 || !parts[0] || !parts[1]) {
		return;
	}

	const lat = parseFloat(parts[0]);
	const lng = parseFloat(parts[1]);

	if (isNaN(lat) || isNaN(lng)) {
		return;
	}

	// Check if the coordinates have actually changed
	if (props.modelValue && props.modelValue.latitude === lat && props.modelValue.longitude === lng) {
		return; // No change, do nothing
	}

	// Update location
	emit('update:modelValue', {
		latitude: lat,
		longitude: lng
	});

	// Reverse geocode to populate the address and selection
	await reverseGeocode(lat, lng);
}

// Handle search term change
async function handleSearchChange(event: any) {
	const term = event.detail.value;
	searchTerm.value = term;

	if (!term || term.trim() === '') {
		results.value = [];
		return;
	}

	await performSearch(term);
}

async function performSearch(term: string) {
	loading.value = true;

	try {
		const res = await autocomplete(term, session);

		if (res.success && 'data' in res && res.data) {
			const suggestions = res.data;

			results.value = suggestions.map((suggestion: EventAutocompleteSuggestion) => ({
				label: suggestion.name,
				subtitle: suggestion.address || formatDistance(suggestion.distance_meters),
				latitude: 0, // Will be geocoded when selected
				longitude: 0,
				full_name: suggestion.full_name,
				types: suggestion.types || []
			}));
		} else {
			results.value = [];
		}
	} catch (error) {
		console.error('Autocomplete error:', error);
		await Toast.show({
			text: 'An error occurred while searching for locations.',
			duration: 'long'
		});
		results.value = [];
	} finally {
		loading.value = false;
	}
}

// Watch for selection changes
watch(selection, async (newSelection) => {
	if (!newSelection) return;

	// Geocode the selected location
	const res = await geocode(newSelection.full_name);
	if (valid(res)) {
		hapticSelection();

		// Update coordinates
		emit('update:modelValue', {
			latitude: res.data.latitude,
			longitude: res.data.longitude
		});

		// Update coordinates input
		coordinatesInput.value = `${res.data.latitude}, ${res.data.longitude}`;
		coordinatesValid.value = true;

		// Update fields with address
		const updatedFields = { ...(props.fields || {}) };
		updatedFields['address'] = newSelection.full_name;
		emit('update:fields', updatedFields);

		// Clear search
		searchTerm.value = '';
		results.value = [];
	} else {
		notifyError();

		console.error('Geocoding error:', res.message);
		await Toast.show({
			text: res.message || 'Failed to geocode selected location',
			duration: 'long'
		});

		// Reset selection on error
		selection.value = undefined;
		// Clear search results on error
		results.value = [];
	}
});

async function reverseGeocode(lat: number, lng: number) {
	const res = await reverseGeocodeFromComposable(lat, lng);

	if (res.success && 'data' in res && res.data) {
		// Update fields with address
		const updatedFields = { ...(props.fields || {}) };
		updatedFields['address'] = res.data.address;
		emit('update:fields', updatedFields);

		// Update selection display
		selection.value = {
			label: res.data.address,
			subtitle: undefined,
			latitude: lat,
			longitude: lng,
			full_name: res.data.address,
			types: []
		};
	} else {
		console.error('Reverse geocoding error:', res.message);
	}
}
</script>
