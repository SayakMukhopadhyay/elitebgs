<template>
  <div id="app">
    <router-view />
  </div>
</template>

<script>
import { mapState } from 'vuex'

export default {
  name: 'App',
  computed: {
    ...mapState({
      themes: (state) => state.themes.themes
    }),
    theme: {
      get() {
        return this.$store.state.themes.theme
      },
      set(newTheme) {
        this.$store.commit('setTheme', newTheme)
      }
    }
  },
  beforeMount() {
    try {
      let stored = localStorage.getItem('theme')
      // Fix for moving from old theme object to new theme string
      if (stored !== 'light' && stored !== 'dark') {
        stored = null
      }
      if (stored) {
        this.theme = stored
      } else {
        this.theme = this.themes[0]
      }
      localStorage.setItem('theme', this.theme)
    } catch (err) {
      this.theme = this.themes[0]
      localStorage.setItem('theme', this.theme)
    }
  }
}
</script>
<style lang="sass">
@import '~vuetify/src/styles/styles.sass'

.custom-padding .v-expansion-panel-content__wrap
  padding: 0

.theme--dark.v-btn-toggle:not(.v-btn-toggle--dense) .v-btn.v-btn.v-size--default
  border-color: map-deep-get($material-dark, 'background') !important

.theme--light.v-btn-toggle:not(.v-btn-toggle--dense) .v-btn.v-btn.v-size--default
  border-color: map-deep-get($material-light, 'background') !important

.tab-background.theme--dark.v-tabs > .v-tabs-bar
  background-color: map-deep-get($material-dark, 'background') !important

.tab-background.theme--light.v-tabs > .v-tabs-bar
  background-color: map-deep-get($material-light, 'background') !important

@import '~@/assets/styles/highcharts/fonts.scss'

.theme--light
  @import '~@/assets/styles/highcharts/light.scss'

.theme--dark
  @import '~@/assets/styles/highcharts/dark.scss'
</style>
