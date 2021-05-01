<template>
  <div>
    <v-app-bar
      :class="{ 'custom-dark': theme === themes[1] }"
      :scroll-off-screen="scrollOfScreen"
      :scroll-threshold="scrollThreshold"
      app
      clipped-left
      color="toolbar"
      dark
    >
      <v-btn class="ml-4" exact icon large :to="{ name: 'home' }">
        <v-avatar>
          <v-img :src="require('@/assets/BGSv1.svg')" alt="Elite BGS" />
        </v-avatar>
      </v-btn>
      <v-toolbar-title class="headline text-uppercase pr-2">
        <span>Elite </span>
        <span class="font-weight-light">BGS</span>
      </v-toolbar-title>
      <template v-if="$vuetify.breakpoint.mdAndUp">
        <v-btn text :to="{ name: 'eddb-api-overview' }"> EDDB API </v-btn>
        <v-btn text :to="{ name: 'ebgs-api-overview' }"> Elite BGS API </v-btn>
        <v-btn text :to="{ name: 'bgsbot-api-overview' }"> BGSBot </v-btn>
      </template>
      <v-spacer />

      <v-menu v-if="!$vuetify.breakpoint.mdAndUp" bottom offset-y>
        <template v-slot:activator="{ on }">
          <v-btn v-on="on" dark icon>
            <v-icon>api</v-icon>
          </v-btn>
        </template>

        <v-list>
          <v-list-item :ripple="false" exact :to="{ name: 'eddb-api-overview' }">
            <v-list-item-content class="mr-0"> EDDB API </v-list-item-content>
          </v-list-item>
          <v-list-item :ripple="false" exact :to="{ name: 'ebgs-api-overview' }">
            <v-list-item-content class="mr-0"> Elite BGS API </v-list-item-content>
          </v-list-item>
          <v-list-item :ripple="false" exact :to="{ name: 'bgsbot-api-overview' }">
            <v-list-item-content class="mr-0"> BGSBot </v-list-item-content>
          </v-list-item>
        </v-list>
      </v-menu>

      <template v-if="$vuetify.breakpoint.mdAndUp">
        <v-btn text :to="{ name: 'donate' }"> Support Elite BGS </v-btn>
        <v-btn text :to="{ name: 'tick' }">
          <v-icon>alarm</v-icon>
          {{ currentTick.time_formatted }}
        </v-btn>
        <v-btn v-if="authenticated && authUser.access === adminAccess" :to="{ name: 'admin-data' }" exact icon>
          <v-icon>fas fa-user-secret</v-icon>
        </v-btn>
        <v-btn exact icon :to="{ name: 'about' }">
          <v-icon>info</v-icon>
        </v-btn>
      </template>
      <v-menu v-if="authenticated" bottom offset-y>
        <template v-slot:activator="{ on }">
          <v-btn v-if="authenticated" v-on="on" :class="{ 'mr-4': $vuetify.breakpoint.mdAndUp }" icon>
            <v-icon>person</v-icon>
          </v-btn>
        </template>

        <v-list>
          <v-list-item v-if="authenticated" :ripple="false" :to="{ name: 'profile-data' }">
            <v-list-item-icon class="mr-0">
              <v-icon>person</v-icon>
            </v-list-item-icon>
          </v-list-item>
          <v-list-item v-if="authenticated" :ripple="false" href="/auth/logout">
            <v-list-item-icon class="mr-0">
              <v-icon>power_settings_new</v-icon>
            </v-list-item-icon>
          </v-list-item>
        </v-list>
      </v-menu>
      <v-btn v-else :class="{ 'mr-4': $vuetify.breakpoint.mdAndUp }" icon @click="onClickLogin">
        <v-icon>person</v-icon>
      </v-btn>
      <v-menu v-if="!$vuetify.breakpoint.mdAndUp" bottom offset-y>
        <template v-slot:activator="{ on }">
          <v-btn v-on="on" class="mr-4" dark icon>
            <v-icon>mdi-dots-vertical</v-icon>
          </v-btn>
        </template>

        <v-list>
          <v-list-item
            v-if="authenticated && authUser.access === adminAccess"
            :ripple="false"
            :to="{ name: 'admin-data' }"
            exact
          >
            <v-list-item-icon class="mr-0">
              <v-icon>fas fa-user-secret</v-icon>
            </v-list-item-icon>
          </v-list-item>
          <v-list-item :ripple="false" exact :to="{ name: 'about' }">
            <v-list-item-icon class="mr-0">
              <v-icon>info</v-icon>
            </v-list-item-icon>
          </v-list-item>
          <v-list-item :ripple="false" :to="{ name: 'donate' }">
            <v-list-item-icon class="mr-0">
              <v-icon>attach_money</v-icon>
            </v-list-item-icon>
          </v-list-item>
        </v-list>
      </v-menu>
      <template v-if="hasToolbarTabs" v-slot:extension>
        <slot name="toolbar-tabs" />
      </template>
    </v-app-bar>
    <v-dialog v-model="loginDialog" width="360">
      <login-card />
    </v-dialog>
  </div>
</template>

<script>
import { mapState } from 'vuex'
import LoginCard from '@/components/LoginCard'

export default {
  name: 'Toolbar',
  props: {
    scrollOfScreen: {
      type: Boolean,
      default: false
    },
    scrollThreshold: {
      default: 300
    }
  },
  components: {
    'login-card': LoginCard
  },
  data() {
    return {
      bannedAccess: 'BANNED',
      normalAccess: 'NORMAL',
      adminAccess: 'ADMIN',
      loginDialog: false
    }
  },
  computed: {
    ...mapState({
      themes: (state) => state.themes.themes,
      authenticated: (state) => state.auth.authenticated,
      authUser: (state) => state.auth.user,
      currentTick: (state) => state.ticks.currentTick
    }),
    theme: {
      get() {
        return this.$store.state.themes.theme
      },
      set(newTheme) {
        this.$store.commit('setTheme', newTheme)
      }
    },
    hasToolbarTabs() {
      return this.$slots['toolbar-tabs']
    }
  },
  created() {
    this.$store.dispatch('checkAuthenticated')
    this.$store.dispatch('fetchCurrentTick')
  },
  methods: {
    onClickLogin() {
      if (this.$route.name !== 'home') {
        this.loginDialog = true
      }
    }
  }
}
</script>

<style scoped>
.custom-dark,
.custom-dark .theme--dark.v-btn {
  color: var(--v-primary-base);
}
</style>

<style>
.v-toolbar__content,
.v-toolbar__extension {
  padding: 0 !important;
}
</style>
