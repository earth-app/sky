<template>
	<IonPage>
		<IonContent :fullscreen="true">
			<div class="p-4! flex flex-col gap-4">
				<div
					data-testid="harness-ready"
					class="text-xs text-gray-500"
				>
					{{ ready ? 'ready' : 'loading' }}
				</div>

				<!-- widget mode: render one feed widget by ?kind= -->
				<div
					v-if="kind"
					data-testid="widget-slot"
				>
					<MWidgetSlot
						:kind="kind"
						:topic="topic"
					/>
				</div>

				<!-- report mode: render the report action-sheet button by ?report=1 -->
				<div
					v-if="reportMode"
					data-testid="report-slot"
				>
					<ReportMButton
						content-type="prompt"
						content-id="pmt-1"
						label="Report"
					/>
				</div>

				<!-- poll mode: an explicit-id MicroPoll for the vote-expiry spec by ?poll=1 -->
				<div
					v-if="pollMode"
					data-testid="poll-slot"
				>
					<WidgetsMMicroPoll
						:poll-id="pollId"
						:question="pollQuestion"
						:options="pollOptions"
					/>
				</div>

				<!-- carousel mode: a deterministic multi-slide MInfoCardGroup by ?group=1 -->
				<div
					v-if="groupMode"
					data-testid="group-slot"
				>
					<div
						data-testid="tap-count"
						class="text-xs text-gray-500"
					>
						{{ tapCount }}
					</div>
					<MInfoCardGroup
						title="Card Carousel"
						description="Deterministic multi-slide group for E2E"
						icon="material-symbols:apps"
						show-dots
					>
						<MInfoCard
							v-for="n in 3"
							:key="n"
							:title="`Slide Card ${n}`"
							:content="`Body for card ${n}`"
							:buttons="[{ text: `Action ${n}`, onClick: bumpTap }]"
						/>
					</MInfoCardGroup>
				</div>
			</div>
		</IonContent>
	</IonPage>
</template>

<script setup lang="ts">
// gated behind the test-build flag; 404s in production like crust's __test__ harnesses
const config = useRuntimeConfig();
if (!config.public.testBuild) {
	throw createError({ statusCode: 404, statusMessage: 'Not Found' });
}

// read directly from the URL; an unattached IonPage's useRoute() query can lag on first mount
const params = new URLSearchParams(import.meta.client ? window.location.search : '');

// FeedWidgetKind is auto-imported from the vendored crust useUser; validated against COMPONENTS in MWidgetSlot
const kind = ref<FeedWidgetKind | null>((params.get('kind') as FeedWidgetKind | null) || null);
const topic = ref(params.get('topic') || 'today');
const reportMode = ref(params.get('report') === '1');
const groupMode = ref(params.get('group') === '1');

// poll-expiry spec drives an explicit-id MicroPoll so the prior-vote mock can target it
const pollMode = ref(params.get('poll') === '1');
const pollId = ref(params.get('pollId') || 'e2e-poll');
const pollQuestion = ref(params.get('q') || 'E2E: Which do you prefer?');
const pollOptions = ['Alpha', 'Beta', 'Gamma'];

// observable tap counter so the carousel spec can prove a card's own click still fired
const tapCount = ref(0);
function bumpTap() {
	tapCount.value += 1;
}

const ready = ref(false);
onMounted(() => {
	ready.value = true;
});
</script>
