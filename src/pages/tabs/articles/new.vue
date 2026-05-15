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
	if (user.value) {
		if (user.value.account.visibility !== 'PUBLIC') {
			router.push(`/tabs/profile/@${user.value.username}`);
			await Toast.show({
				text: 'Your account must be public to create articles. Please change your account visibility in your profile settings.',
				duration: 'long'
			});
		}

		if (user.value.account.account_type === 'FREE' || user.value.account.account_type === 'PRO') {
			router.push('/tabs/upgrade?highlighted=WRITER');
			await Toast.show({
				text: 'You need to upgrade to the Writer plan or above to create articles.',
				duration: 'long'
			});
		}
	}
});
</script>
