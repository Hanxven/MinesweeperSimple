<template>
  <div class="ck-wrapper" @click="handleCheck">
    <div
      class="ck-box-wrapper"
      :class="{
        'mw-ck-box--checked': props.modelValue,
        'mw-ck-box--disabled': props.disabled
      }"
    >
      <div class="mw-ck-box-block"></div>
      <Transition name="check">
        <svg
          v-show="props.modelValue"
          class="ck-icon"
          viewBox="0 0 1024 1024"
          version="1.1"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path
            d="M369.792 704.32L930.304 128 1024 223.616 369.984 896l-20.288-20.864-0.128 0.128L0 516.8 96.128 423.68l273.664 280.64z"
            fill="currentColor"
          ></path>
        </svg>
      </Transition>
    </div>
    <span class="ck-label"><slot></slot></span>
  </div>
</template>

<script setup lang="ts">
const props = withDefaults(
  defineProps<{
    modelValue?: boolean
    disabled?: boolean
  }>(),
  { modelValue: false, disabled: false }
)

const emits = defineEmits<{
  (e: 'update:modelValue', val: boolean): void
}>()

const handleCheck = () => {
  if (props.disabled) {
    return
  }
  emits('update:modelValue', !props.modelValue)
}
</script>

<style lang="less" scoped>
.ck-wrapper {
  display: flex;
  align-items: center;
}

.mw-ck-box-block {
  width: 100%;
  height: 100%;
  border-radius: 1px;
  transition: all 0.3s ease;
}

.ck-box-wrapper {
  position: relative;
  box-sizing: border-box;
  height: 14px;
  width: 14px;
  cursor: pointer;
  border: 1px solid rgb(76, 76, 138);
  transition: all 0.3s ease;
  border-radius: 2px;
  box-shadow: 0 0 0px rgb(18, 18, 162);

  &:hover {
    border-color: rgb(18, 18, 162);
  }
}

.ck-box-wrapper.mw-ck-box--disabled {
  cursor: not-allowed;
}

.ck-label {
  margin-left: 4px;
  font-size: 12px;
}

.mw-ck-box--checked .mw-ck-box-block {
  border-color: rgb(63, 96, 96);
  background-color: rgb(87, 87, 208);
}

.mw-ck-box--disabled.mw-ck-box--checked .mw-ck-box-block {
  border-color: rgb(63, 96, 96);
  background-color: rgb(137, 137, 137);
}

.ck-icon {
  position: absolute;
  width: 100%;
  height: 100%;
  left: 0;
  top: 0;
  color: white;
}

.check-enter-from,
.check-leave-to {
  transform: scale(0) rotate(-45deg);
}

.check-enter-active,
.check-leave-active {
  transition: 0.3s all cubic-bezier(1, 0, 0, 1);
}

.check-enter-to,
.check-leave-from {
  transform: scale(1) rotate(0deg);
}
</style>
