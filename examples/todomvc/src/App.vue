<script setup lang="ts">
import { useSignals } from '../../../src/vue.ts'
import {
  todos, draft, filter, filteredTodos, activeCount, allDone,
  addTodo, toggleTodo, deleteTodo, editTodo, clearCompleted, toggleAll,
  type Filter,
} from './state.ts'

const { draft: draftRef, filter: filterRef, filteredTodos: filteredRef,
        activeCount: countRef, allDone: allDoneRef, todos: todosRef } =
  useSignals({ draft, filter, filteredTodos, activeCount, allDone, todos })

function handleKey(e: KeyboardEvent) {
  if (e.key === 'Enter') addTodo()
}

function setFilter(f: Filter) {
  filterRef.value = f
}
</script>

<template>
  <section class="todoapp">
    <header class="header">
      <h1>todos</h1>
      <input
        class="new-todo"
        placeholder="What needs to be done?"
        v-model="draftRef"
        @keyup.enter="addTodo"
        autofocus
      />
    </header>

    <section class="main" v-if="todosRef.length > 0">
      <input
        id="toggle-all"
        class="toggle-all"
        type="checkbox"
        :checked="allDoneRef"
        @change="toggleAll"
      />
      <label for="toggle-all">Mark all as complete</label>

      <ul class="todo-list">
        <TodoItem
          v-for="todo in filteredRef"
          :key="todo.id"
          :todo="todo"
          @toggle="toggleTodo(todo.id)"
          @delete="deleteTodo(todo.id)"
          @edit="(text) => editTodo(todo.id, text)"
        />
      </ul>
    </section>

    <footer class="footer" v-if="todosRef.length > 0">
      <span class="todo-count">
        <strong>{{ countRef }}</strong>
        {{ countRef === 1 ? 'item' : 'items' }} left
      </span>

      <ul class="filters">
        <li><a :class="{ selected: filterRef === 'all' }"       @click="setFilter('all')">All</a></li>
        <li><a :class="{ selected: filterRef === 'active' }"    @click="setFilter('active')">Active</a></li>
        <li><a :class="{ selected: filterRef === 'completed' }" @click="setFilter('completed')">Completed</a></li>
      </ul>

      <button
        class="clear-completed"
        v-if="todosRef.some(t => t.done)"
        @click="clearCompleted"
      >
        Clear completed
      </button>
    </footer>
  </section>
</template>

<script lang="ts">
import TodoItem from './TodoItem.vue'
export default { components: { TodoItem } }
</script>
