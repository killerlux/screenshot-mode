<script setup lang="ts">
import SelectButton from "primevue/selectbutton";
import ToggleSwitch from "primevue/toggleswitch";
import { useId } from "vue";

import { MessageViewMode } from "@/types";

const showTimestamp = defineModel<boolean>({ required: true });
const showResponseInfo = defineModel<boolean>("showResponseInfo", {
  required: true,
});
const requestViewMode = defineModel<MessageViewMode>("requestViewMode", {
  required: true,
});
const responseViewMode = defineModel<MessageViewMode>("responseViewMode", {
  required: true,
});

const viewModeOptions = [
  { label: "Pretty", value: MessageViewMode.Pretty },
  { label: "Raw", value: MessageViewMode.Raw },
];

const requestLabelId = useId();
const responseLabelId = useId();
</script>

<template>
  <div class="rounded-lg border border-surface-600 p-4">
    <div class="mb-3 flex items-center gap-2">
      <div
        class="flex h-5 w-5 items-center justify-center rounded bg-surface-600"
      >
        <i class="fas fa-info-circle text-xs text-surface-300" />
      </div>
      <label class="text-sm font-medium text-surface-200">Display</label>
    </div>
    <div class="flex items-center justify-between gap-2">
      <label :id="requestLabelId" class="text-sm text-surface-200"
        >Request body</label
      >
      <SelectButton
        v-model="requestViewMode"
        :options="viewModeOptions"
        option-label="label"
        option-value="value"
        :allow-empty="false"
        :aria-labelledby="requestLabelId"
        size="small"
      />
    </div>
    <div class="mt-2 flex items-center justify-between gap-2">
      <label :id="responseLabelId" class="text-sm text-surface-200"
        >Response body</label
      >
      <SelectButton
        v-model="responseViewMode"
        :options="viewModeOptions"
        option-label="label"
        option-value="value"
        :allow-empty="false"
        :aria-labelledby="responseLabelId"
        size="small"
      />
    </div>
    <div class="mt-2 flex items-center justify-between">
      <label class="text-sm text-surface-200">Show Timestamp</label>
      <ToggleSwitch v-model="showTimestamp" />
    </div>
    <div class="mt-2 flex items-center justify-between">
      <label class="text-sm text-surface-200">Show Response Info</label>
      <ToggleSwitch v-model="showResponseInfo" />
    </div>
  </div>
</template>
