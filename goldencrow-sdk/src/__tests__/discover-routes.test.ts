import Fastify from "fastify";
import {
  serializerCompiler,
  validatorCompiler,
} from "fastify-type-provider-zod";

const mockCreateDiscoverPublisherApprovalRequest = jest.fn();
const mockCreateDiscoverFeedItem = jest.fn();
const mockSendDiscoverPublisherRequestNotificationEmail = jest.fn();

jest.mock("../repositories/discover.repository.js", () => ({
  createDiscoverFeedItem: mockCreateDiscoverFeedItem,
  createDiscoverIndividual: jest.fn(),
  createDiscoverOrganization: jest.fn(),
  createDiscoverPublisherApprovalRequest:
    mockCreateDiscoverPublisherApprovalRequest,
  deleteDiscoverFeedItem: jest.fn(),
  deleteDiscoverIndividual: jest.fn(),
  deleteDiscoverOrganization: jest.fn(),
  duplicateDiscoverFeedItem: jest.fn(),
  evaluateDiscoverIndividualSubmission: jest.fn(),
  evaluateDiscoverOrganizationSubmission: jest.fn(),
  getDiscoverFeedItem: jest.fn(),
  getDiscoverIndividual: jest.fn(),
  getDiscoverOrganization: jest.fn(),
  listDiscoverFeedItems: jest.fn(),
  listDiscoverIndividuals: jest.fn(),
  listDiscoverOrganizations: jest.fn(),
  syncDiscoverPublisherSnapshot: jest.fn(),
  updateDiscoverFeedItem: jest.fn(),
  updateDiscoverIndividual: jest.fn(),
  updateDiscoverOrganization: jest.fn(),
}));

jest.mock("../repositories/roles.repository.js", () => ({
  canAccessDiscover: jest.fn(() => true),
}));

jest.mock("../lib/discover-publisher-request-notification-email.js", () => ({
  sendDiscoverPublisherRequestNotificationEmail:
    mockSendDiscoverPublisherRequestNotificationEmail,
}));

async function buildTestServer() {
  const { discoverRoutes } = await import("../routes/discover.routes.js");
  const fastify = Fastify();
  fastify.setValidatorCompiler(validatorCompiler);
  fastify.setSerializerCompiler(serializerCompiler);
  fastify.addHook("onRequest", async (request) => {
    request.adminContext = {
      email: "admin@example.org",
      uid: "uid-1",
      role: "full_admin",
      isBootstrap: true,
      canAccessBackoffice: true,
      canAccessPatientPortal: false,
      canAccessPGFlex: false,
      canAccessPublisherPortal: false,
      projectAccess: ["mydnamap"],
    };
  });
  await fastify.register(discoverRoutes);
  return fastify;
}

function publisherRequestPayload(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    kind: "organization",
    locale: "es",
    name: "Wizard Genetics Lab",
    description: "Laboratorio de genetica clinica para familias.",
    contactEmail: "join@example.org",
    countryCode: "AR",
    organizationType: "org_genetic_testing_laboratories",
    startedAt: new Date(Date.now() - 5000).toISOString(),
    ...overrides,
  };
}

describe("Discover public routes", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCreateDiscoverPublisherApprovalRequest.mockResolvedValue({
      kind: "organization",
      publisher: {
        id: "org-1",
        name: "Wizard Genetics Lab",
        imageUrl: null,
        status: "pending_approval",
        verified: false,
        isGeneticReportProvider: false,
        geneticReportCategory: null,
        isGrcHighlighted: false,
        contactEmail: "join@example.org",
        createdAt: "2026-09-06T00:00:00.000Z",
        updatedAt: "2026-09-06T00:00:00.000Z",
      },
    });
    mockSendDiscoverPublisherRequestNotificationEmail.mockResolvedValue(
      undefined,
    );
    mockCreateDiscoverFeedItem.mockResolvedValue({
      id: "feed-1",
      type: "upcoming_event",
      status: "published",
      upcomingEvent: {
        date: "2026-10-12T00:00:00.000Z",
      },
    });
  });

  it("sends Federico a notification after a public organization request is saved", async () => {
    const fastify = await buildTestServer();

    const response = await fastify.inject({
      method: "POST",
      url: "/discover/publisher-requests",
      headers: {
        origin: "https://goldencrowvs.com",
      },
      payload: publisherRequestPayload(),
    });

    expect(response.statusCode).toBe(201);
    expect(response.json()).toEqual({
      status: "ok",
      kind: "organization",
      publisherId: "org-1",
    });
    expect(mockCreateDiscoverPublisherApprovalRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: "organization",
        contactEmail: "join@example.org",
      }),
    );
    expect(
      mockSendDiscoverPublisherRequestNotificationEmail,
    ).toHaveBeenCalledWith(
      "organization",
      expect.objectContaining({
        id: "org-1",
        name: "Wizard Genetics Lab",
      }),
    );
  });

  it("does not fail the public request if the notification email fails", async () => {
    const fastify = await buildTestServer();
    mockSendDiscoverPublisherRequestNotificationEmail.mockRejectedValueOnce(
      new Error("Gmail unavailable"),
    );

    const response = await fastify.inject({
      method: "POST",
      url: "/discover/publisher-requests",
      headers: {
        origin: "https://goldencrowvs.com",
      },
      payload: publisherRequestPayload({
        contactEmail: "join-alt@example.org",
      }),
    });

    expect(response.statusCode).toBe(201);
    expect(response.json()).toEqual({
      status: "ok",
      kind: "organization",
      publisherId: "org-1",
    });
  });

  it("sends Federico a notification after a public individual publisher request is saved", async () => {
    const fastify = await buildTestServer();
    mockCreateDiscoverPublisherApprovalRequest.mockResolvedValueOnce({
      kind: "individual",
      publisher: {
        id: "ind-1",
        name: "Dr. Wizard",
        contactEmail: "dr@example.org",
      },
    });

    const response = await fastify.inject({
      method: "POST",
      url: "/discover/publisher-requests",
      headers: {
        origin: "https://goldencrowvs.com",
      },
      payload: publisherRequestPayload({
        kind: "individual",
        name: "Dr. Wizard",
        description: "Acompanamiento profesional en genetica clinica.",
        organizationType: undefined,
        individualType: "pro_clinical_geneticists",
        contactEmail: "dr@example.org",
      }),
    });

    expect(response.statusCode).toBe(201);
    expect(response.json()).toEqual({
      status: "ok",
      kind: "individual",
      publisherId: "ind-1",
    });
    expect(
      mockSendDiscoverPublisherRequestNotificationEmail,
    ).toHaveBeenCalledWith(
      "individual",
      expect.objectContaining({
        id: "ind-1",
        name: "Dr. Wizard",
        contactEmail: "dr@example.org",
      }),
    );
  });

  it("keeps camelCase feed item payload nodes when validating route bodies", async () => {
    const fastify = await buildTestServer();

    const response = await fastify.inject({
      method: "POST",
      url: "/discover/feed-items",
      payload: {
        publisherOrganizationId: "org-1",
        type: "upcoming_event",
        status: "published",
        publishedAt: "2026-10-12T12:00:00.000Z",
        language: "en",
        title: "Event title",
        subtitle: "Event subtitle",
        body: "Event body",
        upcomingEvent: {
          date: "2026-10-12T00:00:00.000Z",
        },
        upcoming_event: {
          date: null,
        },
      },
    });

    expect(response.statusCode).toBe(200);
    expect(mockCreateDiscoverFeedItem).toHaveBeenCalledWith(
      expect.objectContaining({ uid: "uid-1" }),
      expect.objectContaining({
        type: "upcoming_event",
        upcomingEvent: {
          date: "2026-10-12T00:00:00.000Z",
        },
      }),
    );
    expect(
      mockCreateDiscoverFeedItem.mock.calls[0]?.[1],
    ).not.toHaveProperty("upcoming_event");
  });
});
