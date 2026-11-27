import assert from 'node:assert/strict';
import { test } from 'node:test';
import { taskTodoEnabled } from '../src/taskTodo';

test('only boolean true turns new tasks into to-dos', () => {
	assert.equal(taskTodoEnabled(true), true);
	assert.equal(taskTodoEnabled(false), false);
	assert.equal(taskTodoEnabled(undefined), false);
	assert.equal(taskTodoEnabled(null), false);
	assert.equal(taskTodoEnabled('true'), false);
	assert.equal(taskTodoEnabled(1), false);
});
