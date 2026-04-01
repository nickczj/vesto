declare global {
  // Nuxt runtime stubs for unit tests
  // eslint-disable-next-line no-var
  var useRuntimeConfig: () => {
    databasePath: string
    vestoGoBaseUrl: string
    vestoV1DbPath: string
  }

  // eslint-disable-next-line no-var
  var createError: (input: { statusCode: number, message: string }) => Error & { statusCode: number }

  // eslint-disable-next-line no-var
  var defineNitroPlugin: <T>(plugin: T) => T
}

export {}
