<script setup lang="ts">
  import { z } from 'zod'
  import { authClient } from '../utils/auth-client'

  const toast = useToast()
  const isSignUp = ref(false)

  // Mirrors the server's rules (server/utils/auth.ts): UTD email only, and
  // Better Auth's default password length of 8–128.
  const email = z.string().email('Invalid email').refine(isUtdEmail, 'Use your @utdallas.edu email')
  const password = z
    .string()
    .min(8, 'Must be at least 8 characters')
    .max(128, 'Must be at most 128 characters')

  const schema = computed(() => {
    if (isSignUp.value) {
      return z.object({
        name: z.string().trim().min(1, 'Name is required'),
        email,
        password,
      })
    } else {
      return z.object({
        email,
        password: z.string().min(1, 'Password is required'),
      })
    }
  })

  const state = reactive({
    name: '',
    email: '',
    password: '',
  })

  async function handleSubmit() {
    if (isSignUp.value) {
      const { error } = await authClient.signUp.email({
        name: state.name.trim(),
        email: state.email,
        password: state.password,
        callbackURL: '/',
      })

      if (error) {
        toast.add({ title: 'Error', description: error.message, color: 'error' })
      } else {
        isSignUp.value = false
        state.password = ''
        toast.add({
          title: 'Check your email',
          description: 'Open the link we sent you to verify your account',
          color: 'success',
        })
      }
    } else {
      const { error } = await authClient.signIn.email({
        email: state.email,
        password: state.password,
        callbackURL: '/',
      })

      if (error?.status === 403) {
        toast.add({
          title: 'Email not verified',
          description: 'We sent you a new verification link',
          color: 'warning',
        })
      } else if (error) {
        toast.add({ title: 'Error', description: error.message, color: 'error' })
      } else {
        await navigateTo('/', { external: true })
      }
    }
  }
</script>

<template>
  <div class="flex h-full w-full items-center justify-center py-12">
    <UCard class="w-full max-w-md">
      <template #header>
        <div class="flex items-center justify-center text-xl font-bold">
          {{ isSignUp ? 'Sign Up' : 'Login' }}
        </div>
      </template>

      <UForm :schema="schema" :state="state" @submit="handleSubmit" class="space-y-5">
        <UFormField name="name" v-if="isSignUp">
          <UInput v-model="state.name" class="w-full" placeholder="Name" autocomplete="name" />
        </UFormField>

        <UFormField name="email">
          <UInput
            v-model="state.email"
            class="w-full"
            placeholder="netid@utdallas.edu"
            autocomplete="email"
          />
        </UFormField>

        <UFormField name="password">
          <UInput
            v-model="state.password"
            type="password"
            class="w-full"
            placeholder="Password"
            :autocomplete="isSignUp ? 'new-password' : 'current-password'"
          />
        </UFormField>

        <UButton loading-auto type="submit" class="w-full justify-center">
          {{ isSignUp ? 'Create account' : 'Login' }}
        </UButton>
      </UForm>

      <template #footer>
        <div class="text-center text-sm">
          {{ isSignUp ? 'Already have an account?' : "Don't have an account?" }}
          <UButton variant="link" class="p-0" @click="isSignUp = !isSignUp">
            {{ isSignUp ? 'Login' : 'Sign up' }}
          </UButton>
        </div>
      </template>
    </UCard>
  </div>
</template>
