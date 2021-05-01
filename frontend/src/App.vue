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
      themes: (state) => state.themes.themes,
      authenticated: (state) => state.auth.authenticated,
      authUser: (state) => state.auth.user
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
      if (this.authenticated && this.authUser && this.authUser.theme) {
        this.theme = this.authUser.theme
      } else {
        const lightThemeMq = window.matchMedia('(prefers-color-scheme: light)')
        this.$store.commit('setThemeMedia', lightThemeMq)
        this.theme = lightThemeMq.matches ? this.themes[0] : this.themes[1]
        this.$store.commit('setThemeMediaListener', (event) => {
          this.theme = event.matches ? this.themes[0] : this.themes[1]
        })
      }
    } catch (err) {
      this.theme = this.themes[0]
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

.theme--light
  @import '~@/assets/styles/light.scss'

.theme--dark
  @import '~@/assets/styles/dark.scss'
</style>
