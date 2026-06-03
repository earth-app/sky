<template>
	<IonPage>
		<IonHeader>
			<IonToolbar>
				<IonTitle>Create Article</IonTitle>
				<IonButtons slot="start">
					<IonBackButton default-href="/tabs/dashboard" />
					<UAvatar
						:src="avatar128"
						size="md"
						class="self-center mx-2 shadow-md shadow-black/10 light:shadow-black/30"
					/>
				</IonButtons>
			</IonToolbar>
		</IonHeader>
		<IonContent :scroll-y="true">
			<div class="flex flex-col items-center">
				<ArticleMForm
					v-if="user"
					mode="create"
				/>
				<Loading v-else />
			</div>
		</IonContent>
	</IonPage>
</template>

<script setup lang="ts">
import { Toast } from '@capacitor/toast';

const { user, avatar128 } = useAuth();
const router = useIonRouter();

onMounted(async () => {
	if (!user.value) return;

	if (user.value.account.visibility !== 'PUBLIC') {
		await Toast.show({
			text: 'Your account must be public to create articles. Update visibility in your profile, then try again.',
			duration: 'long'
		});
		router.push(`/tabs/profile/@${user.value.username}`);
		return;
	}

	if (user.value.account.account_type === 'FREE' || user.value.account.account_type === 'PRO') {
		await Toast.show({
			text: 'Article creation is a Writer-plan feature. Upgrade to continue.',
			duration: 'long'
		});
		router.push('/tabs/upgrade?highlighted=WRITER');
	}
});
</script>
