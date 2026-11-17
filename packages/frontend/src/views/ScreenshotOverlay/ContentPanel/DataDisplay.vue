<script setup lang="ts">
import { StateEffect } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import Splitter from "primevue/splitter";
import SplitterPanel from "primevue/splitterpanel";
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from "vue";

import { SelectionContextMenu } from "@/components/SelectionContextMenu";
import { useSDK } from "@/plugins/sdk";
import {
  Disposition,
  type MessageViewMode,
  type RedactionRule,
  type ResponseMeta,
  RuleTarget,
  type ScreenshotSettings,
} from "@/types";
import {
  applyDecorations,
  formattingDropsRedactions,
} from "@/utils/decorations";
import { mountEditor } from "@/utils/editor";
import { filterHeaders } from "@/utils/headers";
import { formatHttpMessage, getHttpContentType } from "@/utils/httpFormatting";
import { isPresent } from "@/utils/optional";

const {
  requestRaw,
  responseRaw,
  settings,
  splitterSizes,
  responseInfo = undefined,
  timestamp = undefined,
} = defineProps<{
  requestRaw: string;
  responseRaw: string;
  settings: ScreenshotSettings;
  splitterSizes: [number, number];
  responseInfo?: ResponseMeta;
  timestamp?: string;
}>();

const emit = defineEmits<{
  addHighlight: [regex: string, target: RuleTarget];
  addRedaction: [regex: string, target: RuleTarget];
  addHiddenHeader: [headerName: string];
  updateSplitterSizes: [sizes: [number, number]];
}>();

const sdk = useSDK();

const requestEditorContainer = ref<HTMLElement | undefined>(undefined);
const responseEditorContainer = ref<HTMLElement | undefined>(undefined);

const splitterKey = ref(0);

const requestEditor = sdk.ui.httpRequestEditor();
const responseEditor = sdk.ui.httpResponseEditor();

const splitterLayout = computed(() => {
  return settings.disposition === Disposition.Horizontal
    ? "horizontal"
    : "vertical";
});

const contextMenuVisible = ref(false);
const contextMenuPosition = ref({ x: 0, y: 0 });
const selectedText = ref("");
const selectionTarget = ref<RuleTarget>(RuleTarget.Request);

const requestHeaderRules = computed(() => [
  ...settings.headersToHide.both,
  ...settings.headersToHide.request,
]);
const responseHeaderRules = computed(() => [
  ...settings.headersToHide.both,
  ...settings.headersToHide.response,
]);

const requestRedactions = computed(() =>
  settings.redactions.filter((rule) => rule.target === RuleTarget.Request),
);
const responseRedactions = computed(() =>
  settings.redactions.filter((rule) => rule.target === RuleTarget.Response),
);

function displayMessage(
  raw: string,
  headerRules: string[],
  mode: MessageViewMode,
  redactions: RedactionRule[],
): string {
  const filtered = filterHeaders(raw, headerRules);
  const formatted = formatHttpMessage(filtered, mode, getHttpContentType(raw));

  if (formatted === filtered) return formatted;

  return formattingDropsRedactions(filtered, formatted, redactions)
    ? filtered
    : formatted;
}

const displayedRequest = computed(() =>
  displayMessage(
    requestRaw,
    requestHeaderRules.value,
    settings.requestViewMode,
    requestRedactions.value,
  ),
);
const displayedResponse = computed(() =>
  displayMessage(
    responseRaw,
    responseHeaderRules.value,
    settings.responseViewMode,
    responseRedactions.value,
  ),
);

function applyRequestDecorations(): void {
  applyDecorations(
    requestEditor.getEditorView(),
    settings.highlights.filter((h) => h.target === RuleTarget.Request),
    requestRedactions.value,
  );
}

function applyResponseDecorations(): void {
  applyDecorations(
    responseEditor.getEditorView(),
    settings.highlights.filter((h) => h.target === RuleTarget.Response),
    responseRedactions.value,
  );
}

function setEditorText(view: EditorView, text: string): void {
  if (view.state.doc.toString() === text) return;

  view.dispatch({
    changes: { from: 0, to: view.state.doc.length, insert: text },
  });
}

function updateRequestEditor(): void {
  setEditorText(requestEditor.getEditorView(), displayedRequest.value);
  applyRequestDecorations();
}

function updateResponseEditor(): void {
  setEditorText(responseEditor.getEditorView(), displayedResponse.value);
  applyResponseDecorations();
}

function updateEditors(): void {
  updateRequestEditor();
  updateResponseEditor();
}

watch(displayedRequest, updateRequestEditor);
watch(displayedResponse, updateResponseEditor);

watch(
  () => [settings.highlights, settings.redactions],
  () => {
    applyRequestDecorations();
    applyResponseDecorations();
  },
  { deep: true },
);

watch(
  () => settings.width,
  async () => {
    emit("updateSplitterSizes", [50, 50]);
    splitterKey.value++;
    await nextTick();
    mountEditors();
  },
);

function mountEditors(): void {
  if (isPresent(requestEditorContainer.value)) {
    mountEditor(requestEditorContainer.value, requestEditor.getElement());
  }

  if (isPresent(responseEditorContainer.value)) {
    mountEditor(responseEditorContainer.value, responseEditor.getElement());
  }

  updateEditors();
}

function handleGlobalClick(): void {
  contextMenuVisible.value = false;
}

function handleHighlight(): void {
  emit("addHighlight", selectedText.value, selectionTarget.value);
  contextMenuVisible.value = false;
}

function handleRedact(): void {
  emit("addRedaction", selectedText.value, selectionTarget.value);
  contextMenuVisible.value = false;
}

function handleHideHeader(): void {
  const colonIndex = selectedText.value.indexOf(":");
  const headerName =
    colonIndex > 0
      ? selectedText.value.substring(0, colonIndex).trim()
      : selectedText.value.trim();
  emit("addHiddenHeader", headerName);
  contextMenuVisible.value = false;
}

function handleResizeEnd(e: { sizes: number[] }): void {
  emit("updateSplitterSizes", [e.sizes[0], e.sizes[1]] as [number, number]);
}

function handleRequestContextMenu(e: MouseEvent): void {
  setTimeout(() => {
    const view = requestEditor.getEditorView();
    const sel = view.state.selection.main;
    const text = view.state.sliceDoc(sel.from, sel.to);
    if (text.length > 0) {
      selectedText.value = text;
      selectionTarget.value = RuleTarget.Request;
      contextMenuPosition.value = { x: e.clientX, y: e.clientY };
      contextMenuVisible.value = true;
    }
  }, 0);
}

function handleResponseContextMenu(e: MouseEvent): void {
  setTimeout(() => {
    const view = responseEditor.getEditorView();
    const sel = view.state.selection.main;
    const text = view.state.sliceDoc(sel.from, sel.to);
    if (text.length > 0) {
      selectedText.value = text;
      selectionTarget.value = RuleTarget.Response;
      contextMenuPosition.value = { x: e.clientX, y: e.clientY };
      contextMenuVisible.value = true;
    }
  }, 0);
}

onMounted(() => {
  document.addEventListener("click", handleGlobalClick);

  requestEditor
    .getElement()
    .addEventListener("contextmenu", handleRequestContextMenu);

  responseEditor
    .getElement()
    .addEventListener("contextmenu", handleResponseContextMenu);

  mountEditors();

  for (const view of [
    requestEditor.getEditorView(),
    responseEditor.getEditorView(),
  ]) {
    view.dispatch({
      effects: StateEffect.appendConfig.of(EditorView.lineWrapping),
    });
  }
});

onUnmounted(() => {
  document.removeEventListener("click", handleGlobalClick);
  if (isPresent(requestEditorContainer.value)) {
    requestEditorContainer.value.innerHTML = "";
  }
  if (isPresent(responseEditorContainer.value)) {
    responseEditorContainer.value.innerHTML = "";
  }
});

function clearSelectionsForCapture(): void {
  const requestView = requestEditor.getEditorView();
  const responseView = responseEditor.getEditorView();

  requestView.dispatch({ selection: { anchor: 0 } });
  responseView.dispatch({ selection: { anchor: 0 } });

  requestView.contentDOM.blur();
  responseView.contentDOM.blur();
}

defineExpose({
  clearSelectionsForCapture,
});
</script>

<template>
  <Splitter
    :key="splitterKey"
    :layout="splitterLayout"
    class="flex-1 overflow-hidden"
    @resizeend="handleResizeEnd"
  >
    <SplitterPanel
      :size="splitterSizes[0]"
      :min-size="10"
      class="overflow-hidden p-0"
    >
      <div ref="requestEditorContainer" class="h-full w-full" />
    </SplitterPanel>
    <SplitterPanel
      :size="splitterSizes[1]"
      :min-size="10"
      class="overflow-hidden p-0"
    >
      <div ref="responseEditorContainer" class="h-full w-full" />
    </SplitterPanel>
  </Splitter>

  <div
    v-if="isPresent(responseInfo) || isPresent(timestamp)"
    class="flex shrink-0 items-center justify-between border-t border-surface-600 px-3 py-1 text-xs text-surface-400"
  >
    <span v-if="isPresent(timestamp)">{{ timestamp }}</span>
    <span v-else />
    <span v-if="isPresent(responseInfo)">
      {{ responseInfo.length.toLocaleString() }} bytes |
      {{ responseInfo.roundtripTime }}ms
    </span>
  </div>

  <SelectionContextMenu
    :x="contextMenuPosition.x"
    :y="contextMenuPosition.y"
    :visible="contextMenuVisible"
    @highlight="handleHighlight"
    @redact="handleRedact"
    @hide-header="handleHideHeader"
    @close="contextMenuVisible = false"
  />
</template>
