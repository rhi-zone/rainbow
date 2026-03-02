<script setup lang="ts">
import { ref } from 'vue'
import type { Todo } from './state.ts'

const props = defineProps<{ todo: Todo }>()
const emit = defineEmits<{
  toggle: []
  delete: []
  edit: [text: string]
}>()

const editing = ref(false)
const editText = ref('')

function startEdit() {
  editing.value = true
  editText.value = props.todo.text
}

function commitEdit() {
  const text = editText.value.trim()
  if (text) emit('edit', text)
  else emit('delete')
  editing.value = false
}

function cancelEdit() {
  editing.value = false
}
</script>

<template>
  <li :class="{ completed: todo.done, editing }">
    <div class="view">
      <input class="toggle" type="checkbox" :checked="todo.done" @change="emit('toggle')" />
      <label @dblclick="startEdit">{{ todo.text }}</label>
      <button class="destroy" @click="emit('delete')" />
    </div>
    <input
      v-if="editing"
      class="edit"
      v-model="editText"
      @blur="commitEdit"
      @keyup.enter="commitEdit"
      @keyup.escape="cancelEdit"
    />
  </li>
</template>
