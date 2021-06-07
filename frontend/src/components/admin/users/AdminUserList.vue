<template>
  <div>
    <h1>Users</h1>
    <v-form>
      <h4>Filter User</h4>
      <v-row>
        <v-col cols="12" sm="6">
          <v-text-field v-model="username" hint="Garud" label="Username/Id"></v-text-field>
        </v-col>
      </v-row>
    </v-form>
    <v-data-table
      class="elevation-1"
      :headers="headers"
      :items="users"
      :page.sync="page"
      :server-items-length="totalUsers"
      :items-per-page="10"
      :footer-props="tableFooter"
      :loading="loading"
    >
      <template v-slot:[`item.name`]="{ item }">
        <router-link :to="{ name: 'faction-detail', params: { factionId: item._id } }">{{ item.name }}</router-link>
      </template>
    </v-data-table>
  </div>
</template>

<script>
import { debounceTime, switchMap } from 'rxjs/operators'
import { mapMutations, mapState } from 'vuex'

export default {
  name: 'AdminUserList',
  data() {
    return {
      username: '',
      headers: [
        {
          text: 'Username',
          value: 'username'
        },
        {
          text: 'Discriminator',
          value: 'discriminator'
        },
        {
          text: 'Access',
          value: 'access'
        },
        {
          text: 'Discord Id',
          value: 'id'
        }
      ],
      tableFooter: {
        disableItemsPerPage: true,
        showFirstLastPage: true,
        showCurrentPage: true
      },
      page: 1,
      totalUsers: 0,
      loading: false
    }
  },
  created() {
    this.fetchUsers()
    this.$watchAsObservable('username')
      .pipe(debounceTime(300))
      .pipe(
        switchMap((value) => {
          this.loading = true
          return this.$store.dispatch('fetchUsers', {
            page: this.page,
            beginsWith: value.newValue
          })
        })
      )
      .subscribe((usersPaginated) => {
        this.setUsers(usersPaginated.docs)
        this.totalUsers = usersPaginated.total
        this.loading = false
      })
  },
  computed: {
    ...mapState({
      users: (state) => state.admin.users
    })
  },
  watch: {
    page() {
      this.fetchUsers()
    }
  },
  methods: {
    ...mapMutations(['setUsers']),
    async fetchUsers() {
      this.loading = true
      let usersPaginated = await this.$store.dispatch('fetchUsers', {
        page: this.page,
        beginsWith: this.username
      })
      this.setUsers(usersPaginated.docs)
      this.totalUsers = usersPaginated.total
      this.loading = false
    }
  }
}
</script>

<style scoped></style>
