import { ApplicationConfig, provideZoneChangeDetection } from "@angular/core";
import { provideRouter, withComponentInputBinding } from "@angular/router";
import { provideHttpClient, withInterceptors } from "@angular/common/http";
import { provideFirebaseApp, initializeApp } from "@angular/fire/app";
import { provideAuth, getAuth } from "@angular/fire/auth";
import { environment } from "@environments/environment";
import { routes } from "./app.routes";
import { authInterceptor } from "@core/interceptors/auth.interceptor";
import { errorInterceptor } from "@core/interceptors/error.interceptor";
import { API_BASE_URL } from "@proxy/payment-app-proxy";
import {
  AuthenticationClient,
  SettingsClient,
  TeamClient,
  LicensesClient,
  AppsClient,
  PaymentProfilesClient,
  PaymentsClient,
  CustomersClient,
  FraudPoliciesClient,
} from "@proxy/payment-app-proxy";
import {
  PaymentsClient as BasePaymentsClient,
  CustomersClient as BaseCustomersClient,
  API_BASE_URL as BASE_API_BASE_URL,
} from "@proxy/payment-proxy";

export const appConfig: ApplicationConfig = {
  providers: [
    provideZoneChangeDetection({ eventCoalescing: true }),
    provideRouter(routes, withComponentInputBinding()),
    provideHttpClient(withInterceptors([authInterceptor, errorInterceptor])),

    provideFirebaseApp(() => initializeApp(environment.firebaseConfig)),
    provideAuth(() => getAuth()),

    { provide: API_BASE_URL, useValue: environment.appBaseUrl },
    { provide: BASE_API_BASE_URL, useValue: environment.base_Url },

    AuthenticationClient,
    SettingsClient,
    TeamClient,
    LicensesClient,
    AppsClient,
    PaymentProfilesClient,
    PaymentsClient,
    CustomersClient,
    FraudPoliciesClient,
    BasePaymentsClient,
    BaseCustomersClient,
  ],
};
