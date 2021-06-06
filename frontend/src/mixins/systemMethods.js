export default {
  methods: {
    fetchSystemsCall(page, systemName) {
      return this.$store.dispatch('fetchSystems', {
        page: page,
        beginsWith: systemName.trim()
      })
    }
  }
}
