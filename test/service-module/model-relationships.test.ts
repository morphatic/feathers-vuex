/*
eslint
@typescript-eslint/explicit-function-return-type: 0,
@typescript-eslint/no-explicit-any: 0
*/
import { assert } from 'chai'
import feathersVuex, { models } from '../../src/index'
import { clearModels } from '../../src/service-module/global-models'

import { feathersRestClient as feathersClient } from '../fixtures/feathers-client'
import Vuex from 'vuex'

describe('Models - `setupInstance` & Relatioships', function() {
  beforeEach(function() {
    clearModels()
  })

  it('initializes instance with return value from setupInstance', function() {
    let calledSetupInstance = false

    const { makeServicePlugin, BaseModel } = feathersVuex(feathersClient, {
      serverAlias: 'myApi'
    })
    class Todo extends BaseModel {
      public id?
      public description: string

      public constructor(data, options?) {
        super(data, options)
      }
    }
    function setupInstance(instance, { models, store }): Todo {
      calledSetupInstance = true

      return Object.assign(instance, {
        extraProp: true
      })
    }
    const store = new Vuex.Store({
      strict: true,
      plugins: [
        makeServicePlugin({
          Model: Todo,
          service: feathersClient.service('service-todos'),
          setupInstance
        })
      ]
    })

    const createdAt = '2018-05-01T04:42:24.136Z'
    const todo = new Todo({
      description: 'Go on a date.',
      isComplete: true,
      createdAt
    })

    assert(calledSetupInstance, 'setupInstance was called')
    assert(todo.extraProp, 'got the extraProp')
  })

  it('allows setting up relationships between models and other constructors', function() {
    const { makeServicePlugin, BaseModel } = feathersVuex(feathersClient, {
      serverAlias: 'myApi'
    })
    class Todo extends BaseModel {
      public id?
      public description: string
      public user: User

      public constructor(data, options?) {
        super(data, options)
      }
    }
    class User extends BaseModel {
      public _id: string
      public firstName: string
      public email: string
    }

    function setupInstance(instance, { models, store }): Todo {
      const { User } = models.myApi

      return Object.assign(instance, {
        // If instance.user exists, convert it to a User instance
        ...(instance.user && { user: new User(instance.user) }),
        // If instance.createdAt exists, convert it to an actual date
        ...(instance.createdAt && { createdAt: new Date(instance.createdAt) })
      })
    }
    const store = new Vuex.Store({
      strict: true,
      plugins: [
        makeServicePlugin({
          Model: Todo,
          service: feathersClient.service('service-todos'),
          setupInstance
        }),
        makeServicePlugin({
          Model: User,
          service: feathersClient.service('users'),
          idField: '_id'
        })
      ]
    })

    const todo = new Todo({
      description: `Show Master Splinter what's up.`,
      isComplete: true,
      createdAt: '2018-05-01T04:42:24.136Z',
      user: {
        _id: 1,
        firstName: 'Michaelangelo',
        email: 'mike@tmnt.com'
      }
    })

    // Check the date
    assert(
      typeof todo.createdAt === 'object',
      'module.createdAt is an instance of object'
    )
    assert(
      todo.createdAt.constructor.name === 'Date',
      'module.createdAt is an instance of date'
    )

    // Check the user
    assert(todo.user instanceof User, 'the user is an instance of User')

    const user = User.getFromStore(1)
    assert.equal(todo.user, user, 'user was added to the user store.')
  })
})

describe('Models - Relationships', function() {
  beforeEach(function() {
    clearModels()

    const { makeServicePlugin, BaseModel } = feathersVuex(feathersClient, {
      serverAlias: 'myApi'
    })
    class Task extends BaseModel {
      public static instanceDefaults() {
        return {
          id: null,
          description: '',
          isComplete: false
        }
      }
    }
    class Todo extends BaseModel {
      public static instanceDefaults(data) {
        const priority = data.priority || 'normal'
        const defaultsByPriority = {
          normal: {
            description: '',
            isComplete: false,
            task: 'Task',
            item: 'Item',
            priority: ''
          },
          high: {
            isHighPriority: true,
            priority: ''
          }
        }
        return defaultsByPriority[priority]
      }
      public static setupInstance(data, { models, store }) {
        const { Task, Item } = models.myApi

        return Object.assign(data, {
          ...(data.task && { task: new Task(data.task) }),
          ...(data.item && { item: new Item(data.item) })
        })
      }
    }
    class Item extends BaseModel {
      public static instanceDefaults() {
        return {
          test: false,
          todo: 'Todo'
        }
      }
      public static setupInstance(data, { models, store }) {
        const { Todo } = models.myApi

        return Object.assign(data, {
          get todos() {
            return Todo.findInStore({ query: {} }).data
          },
          ...(data.todo && { todo: new Todo(data.todo) })
        })
      }
    }
    this.store = new Vuex.Store({
      strict: true,
      plugins: [
        makeServicePlugin({
          Model: Task,
          service: feathersClient.service('tasks')
        }),
        makeServicePlugin({
          Model: Todo,
          service: feathersClient.service('service-todos')
        }),
        makeServicePlugin({
          Model: Item,
          service: feathersClient.service('items'),
          mutations: {
            toggleTestBoolean(state, item) {
              item.test = !item.test
            }
          }
        })
      ]
    })
    this.Todo = Todo
    this.Task = Task
    this.Item = Item
  })

  it('can have different instanceDefaults based on new instance data', function() {
    const { Todo } = this
    const normalTodo = new Todo({
      description: 'Normal'
    })
    const highPriorityTodo = new Todo({
      description: 'High Priority',
      priority: 'high'
    })

    assert(
      !normalTodo.hasOwnProperty('isHighPriority'),
      'Normal todos do not have an isHighPriority default attribute'
    )
    assert(
      highPriorityTodo.isHighPriority,
      'High priority todos have a unique attribute'
    )
  })

  it('adds model instances containing an id to the store', function() {
    const { Todo, Task } = this

    const todo = new Todo({
      task: {
        id: 1,
        description: 'test',
        isComplete: true
      }
    })

    assert.deepEqual(
      Task.getFromStore(1),
      todo.task,
      'task was added to the store'
    )
  })

  it('works with multiple keys that match Model names', function() {
    const { Todo, Task, Item } = this

    const todo = new Todo({
      task: {
        id: 1,
        description: 'test',
        isComplete: true
      },
      item: {
        id: 2,
        test: true
      }
    })

    assert.deepEqual(
      Task.getFromStore(1),
      todo.task,
      'task was added to the store'
    )
    assert.deepEqual(
      Item.getFromStore(2),
      todo.item,
      'item was added to the store'
    )
  })

  it('handles nested relationships', function() {
    const { Todo } = this

    const todo = new Todo({
      task: {
        id: 1,
        description: 'test',
        isComplete: true
      },
      item: {
        id: 2,
        test: true,
        todo: {
          description: 'nested todo under item'
        }
      }
    })

    assert(
      todo.item.todo.constructor.name === 'Todo',
      'the nested todo is an instance of Todo'
    )
  })

  it('handles circular nested relationships', function() {
    const { Todo, Item } = this

    const todo = new Todo({
      id: 1,
      description: 'todo description',
      item: {
        id: 2,
        test: true,
        todo: {
          id: 1,
          description: 'todo description'
        }
      }
    })

    assert.deepEqual(Todo.getFromStore(1), todo, 'todo was added to the store')
    assert.deepEqual(
      Item.getFromStore(2),
      todo.item,
      'item was added to the store'
    )
    assert(todo.item, 'todo still has an item')
    assert(todo.item.todo, 'todo still nested in itself')
  })

  it('updates related data', function() {
    const { Todo, store } = this

    const module = new Todo({
      id: 'todo-1',
      description: 'todo description',
      item: {
        id: 'item-2',
        test: true,
        todo: {
          id: 'todo-1',
          description: 'todo description'
        }
      }
    })

    const storedTodo = store.state.todos.keyedById['todo-1']
    const storedItem = store.state.items.keyedById['item-2']

    store.commit('items/toggleTestBoolean', storedItem)
    // module.item.test = false

    assert.equal(
      module.item.test,
      false,
      'the nested module.item.test should be false'
    )
    assert.equal(
      storedTodo.item.test,
      false,
      'the nested item.test should be false'
    )
    assert.equal(storedItem.test, false, 'item.test should be false')
  })

  it(`allows creating more than once relational instance`, function() {
    const { Todo, store } = this

    const todo1 = new Todo({
      id: 'todo-1',
      description: 'todo description',
      item: {
        id: 'item-2',
        test: true
      }
    })
    const todo2 = new Todo({
      id: 'todo-2',
      description: 'todo description',
      item: {
        id: 'item-3',
        test: true
      }
    })

    const storedTodo = store.state.todos.keyedById['todo-2']
    const storedItem = store.state.items.keyedById['item-3']

    assert.equal(
      todo1.item.test,
      true,
      'the nested module.item.test should be true'
    )
    assert.equal(
      todo2.item.test,
      true,
      'the nested module.item.test should be true'
    )
    assert.equal(
      storedTodo.item.test,
      true,
      'the nested item.test should be true'
    )
    assert.equal(storedItem.test, true, 'item.test should be true')
  })

  it(`handles arrays of related data`, function() {
    const { Todo, store } = this

    const todo1 = new Todo({
      id: 'todo-1',
      description: 'todo description',
      item: [
        {
          id: 'item-1',
          test: true
        },
        {
          id: 'item-2',
          test: true
        }
      ]
    })
    const todo2 = new Todo({
      id: 'todo-2',
      description: 'todo description',
      item: [
        {
          id: 'item-3',
          test: true
        },
        {
          id: 'item-4',
          test: true
        }
      ]
    })

    assert(todo1, 'todo1 is an instance')
    assert(todo2, 'todo2 is an instance')

    const storedTodo1 = store.state.todos.keyedById['todo-1']
    const storedTodo2 = store.state.todos.keyedById['todo-2']
    const storedItem1 = store.state.items.keyedById['item-1']
    const storedItem2 = store.state.items.keyedById['item-2']
    const storedItem3 = store.state.items.keyedById['item-3']
    const storedItem4 = store.state.items.keyedById['item-4']

    assert(storedTodo1, 'should have todo 1')
    assert(storedTodo2, 'should have todo 2')
    assert(storedItem1, 'should have item 1')
    assert(storedItem2, 'should have item 2')
    assert(storedItem3, 'should have item 3')
    assert(storedItem4, 'should have item 4')
  })
})
